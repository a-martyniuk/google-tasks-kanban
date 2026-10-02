import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { prisma } from '../db/prisma.js';

export interface UserSessionPayload {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isDemo?: boolean;
}

export class AuthService {
  private getOAuthClient() {
    return new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  getGoogleAuthUrl(): string {
    if (!config.google.clientId || !config.google.clientSecret) {
      throw new Error(
        'Google OAuth no está configurado. Por favor define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env'
      );
    }

    const client = this.getOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: config.google.scopes,
    });
  }

  async handleGoogleCallback(code: string): Promise<{ token: string; user: any }> {
    const client = this.getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const googleId = userInfo.data.id;
    const email = userInfo.data.email;
    const name = userInfo.data.name;
    const avatar = userInfo.data.picture;

    if (!googleId || !email) {
      throw new Error('No se pudo obtener la identidad del usuario desde Google');
    }

    // Upsert User
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        avatarUrl: avatar,
      },
      update: {
        name,
        avatarUrl: avatar,
      },
    });

    // Upsert OAuth Account
    if (tokens.access_token) {
      await prisma.oAuthAccount.upsert({
        where: {
          provider_provider_account_id: {
            provider: 'google',
            providerAccountId: googleId,
          },
        },
        create: {
          userId: user.id,
          provider: 'google',
          providerAccountId: googleId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
          scope: tokens.scope || null,
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || undefined,
          expiresAt: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
          scope: tokens.scope || undefined,
        },
      });
    }

    const token = this.generateSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      avatarUrl: user.avatarUrl || undefined,
    });

    return { token, user };
  }

  generateSessionToken(payload: UserSessionPayload): string {
    return jwt.sign(payload, config.sessionSecret, { expiresIn: '7d' });
  }

  verifySessionToken(token: string): UserSessionPayload | null {
    try {
      return jwt.verify(token, config.sessionSecret) as UserSessionPayload;
    } catch {
      return null;
    }
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const oauth = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: 'google' },
    });

    if (!oauth) {
      throw new Error('No hay cuenta de Google vinculada para este usuario.');
    }

    const now = Date.now();
    const isExpired = oauth.expiresAt ? Number(oauth.expiresAt) <= now : false;

    if (isExpired && oauth.refreshToken) {
      const client = this.getOAuthClient();
      client.setCredentials({ refresh_token: oauth.refreshToken });
      const { credentials } = await client.refreshAccessToken();

      if (credentials.access_token) {
        await prisma.oAuthAccount.update({
          where: { id: oauth.id },
          data: {
            accessToken: credentials.access_token,
            expiresAt: credentials.expiry_date ? BigInt(credentials.expiry_date) : null,
          },
        });
        return credentials.access_token;
      }
    }

    return oauth.accessToken;
  }
}
