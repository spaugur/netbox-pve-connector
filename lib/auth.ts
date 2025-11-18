import { Request } from "express";
import { errors } from "@/lib/errors";

export const handle_401_response = (req: Request) => {
    return errors.UNAUTHENTICATED_REQUEST;
};
