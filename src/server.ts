import { is_str } from "@/lib/utils";
import dotenv from "dotenv";
dotenv.config();

/*let errcount = 0;
if (!is_str(process.env.SERVER_API_TOKEN)) {
    console.error("Must set `SERVER_API_TOKEN` environment variable.");
    errcount++;
}

if (!is_str(process.env.REDIS_URL)) {
    console.error("Must set `REDIS_URL` environment variable.");
    errcount++;
}

if (errcount > 0) {
    process.exit(1);
}*/

let basic_auth_users: { [key: string]: string } = {};
for (const [key, value] of Object.entries(process.env)) {
    if (!key.toUpperCase().startsWith("BASIC_AUTH_USERS")) {
        continue;
    }

    const basic_auth_user_name = key.substring(
        "BASIC_AUTH_USERS".length + 1,
        key.length,
    );
    const basic_auth_pass_word = value;

    if (!is_str(basic_auth_user_name) || !is_str(basic_auth_pass_word)) {
        continue;
    }

    basic_auth_users[basic_auth_user_name.toLowerCase()] = basic_auth_pass_word;
}

import express, { Request, Response } from "express";
import cors from "cors";
import basic_auth from "express-basic-auth";
import { handle_401_response } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { handle_vm_event } from "@/src/services/vm";
import {
    clone_proxmox_template,
    create_proxmox_guest,
    get_proxmox_task_status,
    update_proxmox_guest_config,
} from "@/lib/proxmox";

const app = express();
const port = process.env.PORT || 8080;

app.set("view engine", "ejs");

app.disable("x-powered-by");

app.use(express.json());
app.use(cors());
app.use("/public/static", express.static("static"));
app.use(
    basic_auth({
        users: basic_auth_users,
        challenge: true,
        unauthorizedResponse: handle_401_response,
    }),
);

app.get("/test", async (req: Request, res: Response) => {
    /*const vm = await create_proxmox_guest({
        pve_uri: "https://nh16-mahv1.spaugurdata.com:8006",
        pve_node_id: "rey-hv1",
        pve_guest_id: 777,
        pve_guest_name: "netbox-pve-connector-test",
        pve_storage_id: "vm",
        pve_guest_disk_size_gb: 10,
        pve_guest_cpu_count: 1,
        pve_guest_memory_mb: 1024,
        pve_bridge_id: "vmbr0",
        pve_guest_network_speed_limit_mbps: 1000,
        pve_guest_ipv4_cidr: "103.146.102.99/24",
        pve_guest_ipv6_cidr: "2a07:54c4::99/48",
        pve_guest_ipv4_gw: "103.146.102.254",
        pve_guest_ipv6_gw: "2a07:54c4::254",
        pve_guest_nameservers: ["8.8.8.8", "8.8.4.4"],
        pve_guest_ssh_keys: [
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOOosb9EHgPyOsPF4efZb+6e+Ljl+3d5FviSzMeNTXoB kria.elinarbur@spaugurdata.com",
        ],
        pve_token_id: "kria@pam!netbox-pve-connector.dev",
        pve_encrypted_token_secret: "108ff5db-0141-4abd-a162-9eb83bdd5031",
    });

    if (vm.isOk()) {
        return res.status(200).send(vm.value);
    } else {
        return res.status(500).send(vm.error);
    }*/

    res.status(202).json("workin on it");

    const init = {
        pve_uri: "<-->",
        pve_node_id: "<-->",
        pve_token_id: "<-->",
        pve_encrypted_token_secret: "<-->",
    };

    const vmid = 378;

    const vm = await clone_proxmox_template({
        ...init,
        pve_template_id: 1000, // debian-bookworm
        pve_guest_id: vmid,
        pve_guest_name: "netbox-pve-connector-test",
        pve_storage_id: "vm",
    });

    if (vm.isErr()) {
        logger.error(vm.error);

        return;
    }

    logger.debug("Fetching task status until success or timeout");

    const success = await new Promise((resolve) => {
        let errcount = 0;
        let itercount = 0;
        const interval = setInterval(async () => {
            itercount++;

            logger.debug(
                `Checking task with UPID ${vm.value.upid}, iteration ${itercount}.`,
            );

            if (itercount > 60 * 5) {
                logger.debug(`Iteration count surpassed ${60 * 5}, failing...`);

                clearInterval(interval);

                return resolve(false);
            }

            if (errcount > 10) {
                logger.debug("Error count surpassed 10, failing...");

                clearInterval(interval);

                return resolve(false);
            }

            const task_status = await get_proxmox_task_status({
                ...init,
                pve_upid: vm.value.upid,
            });

            if (task_status.isErr()) {
                logger.debug("Request fail, increasing error count.");

                errcount++;

                return;
            }

            if (
                task_status.value.status === "stopped" &&
                task_status.value.exitstatus?.toLowerCase() === "ok"
            ) {
                logger.debug(
                    "Task status is `stopped` and exit status is `ok`, succeeding!",
                );

                clearInterval(interval);

                return resolve(true);
            }

            if (
                task_status.value.status === "stopped" &&
                !(task_status.value.exitstatus?.toLowerCase() === "ok")
            ) {
                logger.debug(
                    "Task status is `stopped` but exit status is not `ok`, failing...",
                );

                clearInterval(interval);

                return resolve(false);
            }
        }, 1000);
    });

    if (success) {
        logger.debug("Successful clone, we can update the VM config now.");
    }

    const config = await update_proxmox_guest_config({
        ...init,
        pve_guest_id: vmid,
        pve_guest_cpu_count: 1,
        pve_guest_memory_mb: 1024,
        pve_bridge_id: "vmbr0",
        pve_guest_network_speed_limit_mbps: 1000,
        pve_guest_ipv4_cidr: "103.146.102.99/24",
        pve_guest_ipv6_cidr: "2a07:54c4::99/48",
        pve_guest_ipv4_gw: "103.146.102.254",
        pve_guest_ipv6_gw: "2a07:54c4::254",
        pve_guest_nameservers: ["8.8.8.8", "8.8.4.4"],
        pve_guest_ssh_keys: [
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOOosb9EHgPyOsPF4efZb+6e+Ljl+3d5FviSzMeNTXoB kria.elinarbur@spaugurdata.com",
        ],
    });

    if (config.isErr()) {
        logger.error(`VM config update error: ${config.error}`);

        return;
    }

    logger.debug("VM config update success!");
});

app.post("/netbox-webhook", async (req: Request, res: Response) => {
    logger.debug(
        "Received webhook payload: " + JSON.stringify(req.body, null, 2),
    );

    res.status(202).json({
        success: {
            code: "ACKNOWLEDGED",
            message: "Event acknowledged, thank you!",
        },
    });

    const event = req.body.event;
    const object_type = req.body.object_type;
    if (!is_str(event) || !is_str(object_type)) {
        logger.warn(
            `Webhook payload \`event\` = ${event} and/or \`object_type\` = ${object_type} are not strings.`,
        );

        return;
    }

    switch (object_type) {
        case "virtualization.virtualmachine": {
            handle_vm_event(req.body);

            return;
        }
    }
});

app.use((req: Request, res: Response) => {
    return res.json(errors.NO_CONTROLLER_AVAILABLE);
});

app.listen(port, () => {
    logger.debug(`Server running at http://0.0.0.0:${port}`);
    logger.debug(
        `Configured users:\n${Object.keys(basic_auth_users)
            .map((k) => " ".repeat(logger.pad_width) + " - " + k)
            .join("\n")}`,
    );
});
