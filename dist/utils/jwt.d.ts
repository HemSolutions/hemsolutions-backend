export interface TokenPayload {
    userId: string;
    email: string;
    role: string;
}
export declare function generateAccessToken(payload: TokenPayload): string;
export declare function generateRefreshToken(payload: TokenPayload): string;
export declare function verifyAccessToken(token: string): TokenPayload;
export declare function verifyRefreshToken(token: string): TokenPayload;
//# sourceMappingURL=jwt.d.ts.map