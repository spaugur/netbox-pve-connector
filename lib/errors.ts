export const errors = {
    UNAUTHENTICATED_REQUEST: {
        code: "UNAUTHENTICATED_REQUEST",
        // prettier-ignore
        message: "You must provide a valid `authorization` header with your request.",
    },
    NO_CONTROLLER_AVAILABLE: {
        code: "NO_CONTROLLER_AVAILABLE",
        message: "No controller could be matched to the route you requested.",
    },
};
