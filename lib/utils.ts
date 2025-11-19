export const is_str = (q: any): q is string => {
    if (typeof q === "string") {
        return true;
    }

    return false;
};

export const is_set = <k>(v: any): v is NonNullable<k> => {
    return v !== undefined && v !== null;
};
