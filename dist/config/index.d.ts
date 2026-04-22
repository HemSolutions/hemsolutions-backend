export declare const config: {
    server: {
        port: number;
        nodeEnv: string;
        isDevelopment: boolean;
        isProduction: boolean;
    };
    database: {
        url: string;
    };
    redis: {
        url: string;
    };
    jwt: {
        secret: string;
        refreshSecret: string;
        expiresIn: string;
        refreshExpiresIn: string;
    };
    stripe: {
        secretKey: string;
        webhookSecret: string;
        publishableKey: string;
    };
    email: {
        sendgridApiKey: string;
        from: string;
        fromName: string;
    };
    frontend: {
        url: string;
    };
    upload: {
        dir: string;
        maxFileSize: number;
    };
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
};
type ConfigValidationResult = {
    missingRequired: string[];
    missingOptional: string[];
};
export declare function getConfigValidationResult(): ConfigValidationResult;
export declare function validateConfig(): void;
export {};
