const fmt_date = (date: Date) => {
    return `${date.getUTCFullYear()}-${date.getUTCMonth().toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")} ${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")}`;
};

export const stringify_err = (error: any) => {
    if (error instanceof Error) {
        return `${error}\n\nTrace: ${error?.stack ?? "N/A"}`;
    }

    return `${error}`;
};

export const error = (msg: string) => {
    return console.log(`(error) ${fmt_date(new Date())} ${msg}`);
};

export const warn = (msg: string) => {
    return console.log(`(warni) ${fmt_date(new Date())} ${msg}`);
};

export const debug = (msg: string) => {
    return console.log(`(debug) ${fmt_date(new Date())} ${msg}`);
};

export const logger = { error, warn, debug };
