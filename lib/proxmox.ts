import { logger, stringify_err } from "@/lib/logger";
import { err, ok } from "neverthrow";
import z, { prettifyError } from "zod";
import { is_set } from "@/lib/utils";

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

export const clone_proxmox_template = async (opts: {
    pve_uri: string;
    pve_node_id: string;
    pve_template_id: number;
    pve_guest_id: number;
    pve_guest_name: string;
    pve_storage_id: string;
    pve_token_id: string;
    pve_encrypted_token_secret: string;
}) => {
    const payload: { [key: string]: string | number } = {
        newid: opts.pve_guest_id,
        node: opts.pve_node_id,
        vmid: opts.pve_template_id,
        full: 1,
        name: opts.pve_guest_name,
        storage: opts.pve_storage_id,
    };

    const req = await pve_fetch(
        `${opts.pve_uri}/api2/json/nodes/${opts.pve_node_id}/qemu/${opts.pve_template_id}/clone`,
        {
            method: "POST",
            headers: {
                Authorization: `PVEAPIToken=${opts.pve_token_id}=${opts.pve_encrypted_token_secret}`,
                "Content-Type": "application/json",
            },
            skipTlsValidation: true,
            body: JSON.stringify(payload),
        },
    );

    if (req.isErr()) {
        logger.error(req.error);

        return err(req.error);
    }

    const data = await z.object({ data: z.string() }).safeParseAsync(req.value);
    if (data.error) {
        prettifyError(data.error);

        return err("UPID_SCHEMA_ERROR");
    }

    return ok({ upid: data.data.data });
};

const Existing_Config = z.object({
    data: z.object({
        ipconfig0: z.string(),
        ciuser: z.string(),
        sockets: z.number(),
        scsi0: z.string(),
        scsihw: z.string(),
        numa: z.union([z.literal(0), z.literal(1)]),
        net0: z.string(),
        meta: z.string(),
        onboot: z.union([z.literal(0), z.literal(1)]),
        cpu: z.string(),
        serial0: z.string(),
        boot: z.string(),
        ostype: z.string(),
        digest: z.string(),
        memory: z.coerce.number(),
        sshkeys: z.string(),
        ide2: z.string(),
        name: z.string(),
        tags: z.string(),
        smbios1: z.string(),
        vmgenid: z.string(),
        agent: z.string(),
        cores: z.number(),
        nameserver: z.string(),
    }),
});

// needs to be gradually iterated to provide full api coverage
export const update_proxmox_guest_config = async (opts: {
    pve_uri: string;
    pve_node_id: string;
    pve_guest_id: number;
    pve_guest_name?: string;
    pve_guest_cpu_count?: number;
    pve_guest_memory_mb?: number;
    pve_bridge_id?: string;
    pve_guest_network_speed_limit_mbps?: number;
    pve_guest_ipv4_cidr?: string;
    pve_guest_ipv6_cidr?: string;
    pve_guest_ipv4_gw?: string;
    pve_guest_ipv6_gw?: string;
    pve_guest_nameservers?: string[];
    pve_guest_ssh_keys?: string[];
    pve_token_id: string;
    pve_encrypted_token_secret: string;
}) => {
    const existing_config = await pve_fetch(
        `${opts.pve_uri}/api2/json/nodes/${opts.pve_node_id}/qemu/${opts.pve_guest_id}/config`,
        {
            method: "GET",
            headers: {
                Authorization: `PVEAPIToken=${opts.pve_token_id}=${opts.pve_encrypted_token_secret}`,
                Accept: "application/json",
            },
            skipTlsValidation: true,
        },
    );

    if (existing_config.isErr()) {
        return err(existing_config.error);
    }

    const parsed_config = await Existing_Config.safeParseAsync(
        existing_config.value,
    );
    if (parsed_config.error) {
        logger.warn(prettifyError(parsed_config.error));

        return err("EXISTING_CONFIG_SCHEMA_ERROR");
    }

    const existing_conf = parsed_config.data.data;

    const payload: { [key: string]: string | number } = {
        node: opts.pve_node_id,
        vmid: opts.pve_guest_id,
    };

    if (is_set(opts.pve_guest_name)) {
        payload.name = opts.pve_guest_name;
    }

    if (is_set(opts.pve_guest_cpu_count)) {
        payload.cores = opts.pve_guest_cpu_count;
    }

    if (is_set(opts.pve_guest_memory_mb)) {
        payload.memory = opts.pve_guest_memory_mb;
    }

    let ratelimit = undefined;
    if (opts.pve_guest_network_speed_limit_mbps) {
        ratelimit = opts.pve_guest_network_speed_limit_mbps / 8;
    }

    if (is_set(ratelimit) || is_set(opts.pve_bridge_id)) {
        let net0 = existing_conf.net0;

        const parts: { [key: string]: string | number } = {};
        for (const part of net0.split(",")) {
            const [key, value] = part.split("=");
            parts[key] = value;
        }

        if (is_set(ratelimit)) {
            parts.rate = ratelimit;
        }

        if (is_set(opts.pve_bridge_id)) {
            parts.bridge = opts.pve_bridge_id;
        }

        net0 = Object.entries(parts)
            .map(([key, value]) => `${key}=${value}`)
            .join(",");

        payload.net0 = net0;
    }

    if (
        is_set(opts.pve_guest_ipv4_cidr) ||
        is_set(opts.pve_guest_ipv6_cidr) ||
        is_set(opts.pve_guest_ipv4_gw) ||
        is_set(opts.pve_guest_ipv6_gw)
    ) {
        let ipconfig0 = existing_conf.ipconfig0;

        const parts: { [key: string]: string | number } = {};
        for (const part of ipconfig0.split(",")) {
            const [key, value] = part.split("=");
            parts[key] = value;
        }

        if (is_set(opts.pve_guest_ipv4_gw)) {
            parts.gw = opts.pve_guest_ipv4_gw;
        }

        if (is_set(opts.pve_guest_ipv6_gw)) {
            parts.gw6 = opts.pve_guest_ipv6_gw;
        }

        if (is_set(opts.pve_guest_ipv4_cidr)) {
            parts.ip = opts.pve_guest_ipv4_cidr;
        }

        if (is_set(opts.pve_guest_ipv6_cidr)) {
            parts.ip6 = opts.pve_guest_ipv6_cidr;
        }

        ipconfig0 = Object.entries(parts)
            .map(([key, value]) => `${key}=${value}`)
            .join(",");

        payload.ipconfig0 = ipconfig0;
    }

    if (opts.pve_guest_nameservers) {
        payload.nameserver = opts.pve_guest_nameservers.join(" ");
    }

    if (opts.pve_guest_ssh_keys) {
        if (opts.pve_guest_ssh_keys.length === 1) {
            payload.sshkeys = encodeURIComponent(opts.pve_guest_ssh_keys[0]);
        } else {
            payload.sshkeys = opts.pve_guest_ssh_keys
                .map((k) => encodeURIComponent(k))
                .join("\n");
        }
    }

    const req = await pve_fetch(
        `${opts.pve_uri}/api2/json/nodes/${opts.pve_node_id}/qemu/${opts.pve_guest_id}/config`,
        {
            method: "POST",
            headers: {
                Authorization: `PVEAPIToken=${opts.pve_token_id}=${opts.pve_encrypted_token_secret}`,
                "Content-Type": "application/json",
            },
            skipTlsValidation: true,
            body: JSON.stringify(payload),
        },
    );

    if (req.isErr()) {
        logger.error(req.error);

        return err(req.error);
    }

    return ok(req.value);
};

const Task_Status = z.object({
    data: z.object({
        id: z.string(),
        node: z.string(),
        pid: z.number(),
        pstart: z.number(),
        starttime: z.number(),
        status: z.enum(["running", "stopped"]),
        type: z.string(),
        upid: z.string(),
        user: z.string(),
        exitstatus: z.string().or(z.null()).optional(),
    }),
});

export const get_proxmox_task_status = async (opts: {
    pve_uri: string;
    pve_node_id: string;
    pve_upid: string;
    pve_token_id: string;
    pve_encrypted_token_secret: string;
}) => {
    const status = await pve_fetch(
        `${opts.pve_uri}/api2/json/nodes/${opts.pve_node_id}/tasks/${opts.pve_upid}/status`,
        {
            method: "GET",
            headers: {
                Authorization: `PVEAPIToken=${opts.pve_token_id}=${opts.pve_encrypted_token_secret}`,
                Accept: "application/json",
            },
            skipTlsValidation: true,
        },
    );

    if (status.isErr()) {
        return err(status.error);
    }

    const data = await Task_Status.safeParseAsync(status.value);
    if (data.error) {
        prettifyError(data.error);

        return err("TASK_STATUS_SCHEMA_ERROR");
    }

    return ok(data.data.data);
};

export const create_proxmox_guest = async (opts: {
    pve_uri: string;
    pve_node_id: string;
    pve_guest_id: number;
    pve_guest_name: string;
    pve_storage_id: string;
    pve_guest_disk_size_gb: number;
    pve_guest_cpu_count: number;
    pve_guest_memory_mb: number;
    pve_bridge_id: string;
    pve_guest_network_speed_limit_mbps?: number;
    pve_guest_ipv4_cidr: string;
    pve_guest_ipv6_cidr: string;
    pve_guest_ipv4_gw: string;
    pve_guest_ipv6_gw: string;
    pve_guest_nameservers: string[];
    pve_guest_ssh_keys?: string[];
    pve_token_id: string;
    pve_encrypted_token_secret: string;
}) => {
    let ratelimit = 125;
    if (opts.pve_guest_network_speed_limit_mbps) {
        ratelimit = opts.pve_guest_network_speed_limit_mbps / 8;
    }

    const payload: { [key: string]: string | number } = {
        node: opts.pve_node_id,
        vmid: opts.pve_guest_id,
        sockets: 1,
        cores: opts.pve_guest_cpu_count,
        cpu: "host",
        scsi0: `${opts.pve_storage_id}:${opts.pve_guest_disk_size_gb}`,
        ide0: `${opts.pve_storage_id}:cloudinit`,
        // prettier-ignore
        ipconfig0: `gw=${opts.pve_guest_ipv4_gw},gw6=${opts.pve_guest_ipv6_gw},ip=${opts.pve_guest_ipv4_cidr},ip6=${opts.pve_guest_ipv6_cidr}`,
        memory: opts.pve_guest_memory_mb,
        name: opts.pve_guest_name,
        nameserver: opts.pve_guest_nameservers.join(" "),
        net0: `virtio,bridge=${opts.pve_bridge_id},firewall=1,rate=${ratelimit}`,
        onboot: 1,
        serial0: "socket",
        boot: "order=scsi0",
        ciuser: "root",
        storage: opts.pve_storage_id,
        citype: "nocloud",
    };

    if (opts.pve_guest_ssh_keys) {
        if (opts.pve_guest_ssh_keys.length === 1) {
            payload.sshkeys = encodeURIComponent(opts.pve_guest_ssh_keys[0]);
        } else {
            payload.sshkeys = opts.pve_guest_ssh_keys
                .map((k) => encodeURIComponent(k))
                .join("\n");
        }
    }

    const req = await pve_fetch(
        `${opts.pve_uri}/api2/json/nodes/${opts.pve_node_id}/qemu`,
        {
            method: "POST",
            headers: {
                Authorization: `PVEAPIToken=${opts.pve_token_id}=${opts.pve_encrypted_token_secret}`,
                "Content-Type": "application/json",
            },
            skipTlsValidation: true,
            body: JSON.stringify(payload),
        },
    );

    if (req.isErr()) {
        logger.error(req.error);

        return err(req.error);
    }

    return ok(req.value);
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
