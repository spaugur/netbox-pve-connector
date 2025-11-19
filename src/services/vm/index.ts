import { logger } from "@/lib/logger";
import { is_str } from "@/lib/utils";
import { err } from "neverthrow";

export const handle_vm_event = async (payload: any & {}) => {
    const event = payload.event;
    if (!is_str(event)) {
        logger.warn(
            `handle_vm_event() is_str() with \`event\` supplied returned false (\`event\` = ${event}).`,
        );

        return err("ERR_EVENT_NOT_STR");
    }

    switch (event.toLowerCase()) {
        case "created":
            return await handle_vm_creation(payload);
    }
};

const handle_vm_creation = async (payload: any & {}) => {};
