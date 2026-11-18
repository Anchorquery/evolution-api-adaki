import { Chatwoot, configService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import postgresql from 'pg';

const { Pool } = postgresql;

class Postgres {
  private logger = new Logger('Postgres');
  private pool;
  private connected = false;

  getConnection(connectionString: string) {
    if (this.connected) {
      return this.pool;
    } else {
      this.pool = new Pool({
        connectionString,
        ssl: this.sslOptions(connectionString),
      });

      this.pool.on('error', () => {
        this.logger.error('postgres disconnected');
        this.connected = false;
      });

      try {
        this.connected = true;
      } catch (e) {
        this.connected = false;
        this.logger.error('postgres connect exception caught: ' + e);
        return null;
      }

      return this.pool;
    }
  }

  // Antes se forzaba SSL siempre, y el Postgres de Chatwoot (contenedor en la
  // red interna) no lo acepta: cada consulta fallaba con "The server does not
  // support SSL connections". Ahora decide la URI: sin sslmode (o
  // sslmode=disable) no hay SSL; con cualquier otro sslmode se cifra sin
  // verificar el certificado, como hacía antes.
  private sslOptions(connectionString: string) {
    let sslmode: string | null = null;
    try {
      sslmode = new URL(connectionString).searchParams.get('sslmode');
    } catch {
      sslmode = null;
    }

    if (!sslmode || sslmode === 'disable') {
      return false;
    }

    return { rejectUnauthorized: false };
  }

  getChatwootConnection() {
    const uri = configService.get<Chatwoot>('CHATWOOT').IMPORT.DATABASE.CONNECTION.URI;

    return this.getConnection(uri);
  }
}

export const postgresClient = new Postgres();
