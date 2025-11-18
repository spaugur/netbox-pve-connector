export const is_str = (q: any): q is string => {
    if (typeof q === "string") {
        return true;
    }

    return false;
};
