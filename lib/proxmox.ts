import { logger, stringify_err } from "@/lib/logger";
import { err, ok } from "neverthrow";
import z, { prettifyError } from "zod";

const pve_fetch = async (
    uri: string,
    init: { skipTlsValidation?: true } & RequestInit,
) => {
    logger.debug(`pve_fetch() called ${init.method ?? "GET"} ${uri}`);

    let req;
    try {
        if (init.skipTlsValidation) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

            logger.warn(
                `* TLS verification skipped for ${init.method ?? "GET"} request to ${uri}. THIS IS INSECURE - DO NOT DO THIS!`,
            );
        }

        if (!init.signal) {
            init.signal = AbortSignal.timeout(5_000);
        }

        req = await fetch(uri, init);
    } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            return err("PVE_FETCH_TIMEOUT");
        }

        logger.error(
            `Error during pve_fetch() ${init.method ?? "GET"} ${uri}: ${stringify_err(e)}`,
        );

        return err("PVE_FETCH_UNDICI_ERROR");
    }

    let json;
    try {
        json = await req.json();
    } catch {
        json = null;
    }

    if (!req.ok) {
        switch (req.status) {
            case 400: {
                logger.warn(
                    `Error reported by server during pve_fetch() ${init.method ?? "GET"} ${uri}. JSON: ${JSON.stringify(json, null, 2)}`,
                );

                return err("PVE_FETCH_BAD_REQUEST");
            }

            case 401: {
                logger.warn(
                    `Server reported 401 Unauthorized during pve_fetch() ${init.method ?? "GET"} ${uri}. JSON: ${JSON.stringify(json, null, 2)}`,
                );

                return err("PVE_FETCH_UNAUTHORIZED");
            }

            case 403: {
                return err("PVE_FETCH_FORBIDDEN");
            }

            case 404: {
                return err("PVE_FETCH_NOT_FOUND");
            }
        }
    }

    logger.debug(
        `pve_fetch() ${init.method ?? "GET"} ${uri} returned status ${req.status} ${req.statusText} and attempted JSON parse: ${json}`,
    );

    if (!json) {
        return err("PVE_FETCH_JSON_SERIALISATION_FAILED");
    }

    return ok(<unknown>json);
};

export const get_proxmox_guest_vnc_websocket = async (opts: {
    pve_uri: string;
    pve_node_id: string;
    pve_guest_id: number;
    pve_vnc_port: number;
    pve_vnc_ticket: string;
    pve_auth_ticket: string;
}) => {
    console.log(opts);

    const req = await pve_fetch(
        `${opts.pve_uri}/api2/json/nodes/${opts.pve_node_id}/qemu/${opts.pve_guest_id}/vncwebsocket?port=${opts.pve_vnc_port}&vncticket=${encodeURIComponent(opts.pve_vnc_ticket)}`,
        {
            method: "GET",
            headers: {
                Cookie: `PVEAuthCookie=${opts.pve_auth_ticket}`,
            },
            skipTlsValidation: true,
        },
    );

    if (req.isErr()) {
        switch (req.error) {
            case "PVE_FETCH_TIMEOUT": {
                return err("TIMED_OUT");
            }

            default: {
                logger.error(
                    `Failed to get_proxmox_guest_vnc_websocket(), ${req.error}`,
                );

                return err("INTERNAL_ERROR");
            }
        }
    }

    console.log(req.value);
};
