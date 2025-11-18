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

//app.get("/", async (req: Request, res: Response) => {});

app.post("/netbox-webhook", async (req: Request, res: Response) => {
    logger.debug(
        "Received webhook payload: " + JSON.stringify(req.body, null, 2),
    );

    return res.json({
        success: {
            code: "ACKNOWLEDGED",
            message: "Event acknowledged, thank you!",
        },
    });
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
