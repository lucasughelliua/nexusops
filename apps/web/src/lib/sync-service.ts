import { prisma } from "./db";
import { decrypt } from "./crypto";
import { createIntegrationClient } from "./integrations";
import { Platform, Prisma } from "@prisma/client";

/**
 * Servicio de sincronización de métricas
 * Sincroniza datos de todas las plataformas conectadas
 */
export class SyncService {
  /**
   * Sincronizar todas las credenciales de un usuario
   */
  async syncUserCredentials(userId: string): Promise<void> {
    console.log(`Starting sync for user: ${userId}`);

    try {
      // Obtener todas las credenciales del usuario
      const credentials = await prisma.credential.findMany({
        where: {
          userId,
          syncStatus: { not: "ERROR" }, // No sincronizar si hay error persistente
        },
        include: {
          account: true,
        },
      });

      console.log(`Found ${credentials.length} credentials to sync`);

      for (const credential of credentials) {
        await this.syncCredential(credential);
      }

      console.log(`Sync completed for user: ${userId}`);
    } catch (error) {
      console.error(`Error syncing user ${userId}:`, error);
    }
  }

  /**
   * Sincronizar una credencial específica
   */
  async syncCredential(credential: any): Promise<void> {
    const startTime = Date.now();

    try {
      // Marcar como en progreso
      await prisma.credential.update({
        where: { id: credential.id },
        data: { syncStatus: "SYNCING" },
      });

      // Desencriptar valor
      let decryptedValue: any;
      try {
        decryptedValue = decrypt(credential.value);
        try {
          decryptedValue = JSON.parse(decryptedValue);
        } catch {
          // Si no es JSON, usar el string directo
        }
      } catch (error) {
        throw new Error("Failed to decrypt credential value");
      }

      // Crear cliente de integración
      const client = createIntegrationClient(credential.platform, decryptedValue);

      // Obtener métricas
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30); // Últimos 30 días

      const metrics = await client.getMetrics({
        startDate,
        endDate,
      });

      console.log(
        `Got ${metrics.length} metrics for credential ${credential.id} (${credential.platform})`
      );

      // Guardar métricas en BD
      let recordsCount = 0;
      for (const metric of metrics) {
        await prisma.metric.create({
          data: {
            accountId: credential.accountId,
            userId: credential.userId,
            platform: credential.platform,
            metricType: metric.metricType,
            value: metric.value,
            currency: metric.currency || "USD",
            date: metric.date,
            dimensions: metric.dimensions as Prisma.InputJsonValue | undefined,
            rawData: metric.rawData as Prisma.InputJsonValue | undefined,
          },
        });
        recordsCount++;
      }

      // Marcar como sincronizado
      const duration = Date.now() - startTime;
      await prisma.credential.update({
        where: { id: credential.id },
        data: {
          syncStatus: "SUCCESS",
          syncError: null,
          lastSyncAt: new Date(),
          nextSyncAt: new Date(Date.now() + 15 * 60 * 1000), // Próxima en 15 min
          syncCount: { increment: 1 },
        },
      });

      // Log de sincronización
      await prisma.syncLog.create({
        data: {
          credentialId: credential.id,
          platform: credential.platform,
          status: "SUCCESS",
          recordsCount,
          duration,
          startedAt: new Date(Date.now() - duration),
          completedAt: new Date(),
        },
      });

      console.log(
        `Successfully synced credential ${credential.id} in ${duration}ms (${recordsCount} records)`
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        `Error syncing credential ${credential.id}:`,
        error
      );

      // Marcar como error
      await prisma.credential.update({
        where: { id: credential.id },
        data: {
          syncStatus: "ERROR",
          syncError: errorMessage.substring(0, 500), // Limitar tamaño
          nextSyncAt: new Date(Date.now() + 60 * 60 * 1000), // Reintentar en 1 hora
        },
      });

      // Log de error
      await prisma.syncLog.create({
        data: {
          credentialId: credential.id,
          platform: credential.platform,
          status: "ERROR",
          recordsCount: 0,
          duration,
          errorMessage,
          startedAt: new Date(Date.now() - duration),
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Sincronizar todas las credenciales de todos los usuarios
   * (Usado por Vercel Cron)
   */
  async syncAll(): Promise<void> {
    console.log("Starting global sync for all users");

    try {
      // Obtener usuarios únicos con credenciales pendientes
      const users = await prisma.user.findMany({
        where: {
          credentials: {
            some: {}, // Usuario con al menos una credencial
          },
        },
        select: {
          id: true,
        },
      });

      console.log(`Syncing ${users.length} users`);

      // Sincronizar cada usuario
      const promises = users.map((user) => this.syncUserCredentials(user.id));
      await Promise.allSettled(promises);

      console.log("Global sync completed");
    } catch (error) {
      console.error("Error in global sync:", error);
    }
  }

  /**
   * Obtener estadísticas de sincronización de un usuario
   */
  async getSyncStats(userId: string) {
    const userCredentials = await prisma.credential.findMany({
      where: { userId },
      select: { id: true },
    });

    const syncLogs = await prisma.syncLog.findMany({
      where: {
        credentialId: { in: userCredentials.map((c) => c.id) },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: 100,
    });

    // Agrupar por credencial
    const byCredential = new Map();

    for (const log of syncLogs) {
      if (!byCredential.has(log.credentialId)) {
        byCredential.set(log.credentialId, {
          credentialId: log.credentialId,
          platform: log.platform,
          totalSyncs: 0,
          successfulSyncs: 0,
          failedSyncs: 0,
          totalRecords: 0,
          averageDuration: 0,
          lastSync: null,
          lastError: null,
        });
      }

      const stats = byCredential.get(log.credentialId);
      stats.totalSyncs++;
      if (log.status === "SUCCESS") {
        stats.successfulSyncs++;
        stats.totalRecords += log.recordsCount;
      } else {
        stats.failedSyncs++;
        if (!stats.lastError) {
          stats.lastError = log.errorMessage;
        }
      }
      if (log.completedAt && !stats.lastSync) {
        stats.lastSync = log.completedAt;
      }
    }

    return Array.from(byCredential.values());
  }
}

export const syncService = new SyncService();
