import { Buffer } from 'buffer';

/**
 * Parse an Event Hub connection string into its components
 * Format: Endpoint=sb://namespace.servicebus.windows.net/;SharedAccessKeyName=keyName;SharedAccessKey=key;EntityPath=eventHubName
 */
export interface EventHubConnectionInfo {
  endpoint: string;
  fullyQualifiedNamespace: string; // hostname without protocol
  sharedAccessKeyName: string;
  sharedAccessKey: string;
  entityPath: string; // Event Hub name
}

export function parseConnectionString(connectionString: string): EventHubConnectionInfo | null {
  try {
    const parts = connectionString.split(';').reduce((acc, part) => {
      const [key, ...valueParts] = part.split('=');
      if (key && valueParts.length > 0) {
        acc[key.trim()] = valueParts.join('=').trim();
      }
      return acc;
    }, {} as Record<string, string>);

    const endpoint = parts['Endpoint'] || '';
    // Extract the hostname from the endpoint URL (remove sb:// and trailing /)
    const fullyQualifiedNamespace = endpoint.replace('sb://', '').replace(/\/$/, '');

    return {
      endpoint: endpoint,
      fullyQualifiedNamespace: fullyQualifiedNamespace,
      sharedAccessKeyName: parts['SharedAccessKeyName'] || '',
      sharedAccessKey: parts['SharedAccessKey'] || '',
      entityPath: parts['EntityPath'] || '',
    };
  } catch {
    return null;
  }
}

export interface StreamMessage {
  id: string;
  timestamp: Date;
  partitionId: string;
  offset: string;
  sequenceNumber: number;
  body: string;
  contentType?: string;
  messageId?: string | number;
  correlationId?: string;
  properties?: Record<string, unknown>;
}

/**
 * Validate if a connection string has all required parts
 */
export function validateConnectionString(connectionString: string): { valid: boolean; error?: string } {
  if (!connectionString || connectionString.trim() === '') {
    return { valid: false, error: 'Connection string is empty' };
  }

  const info = parseConnectionString(connectionString);

  if (!info) {
    return { valid: false, error: 'Invalid connection string format' };
  }

  if (!info.fullyQualifiedNamespace) {
    return { valid: false, error: 'Missing Endpoint in connection string' };
  }

  if (!info.sharedAccessKeyName) {
    return { valid: false, error: 'Missing SharedAccessKeyName in connection string' };
  }

  if (!info.sharedAccessKey) {
    return { valid: false, error: 'Missing SharedAccessKey in connection string' };
  }

  if (!info.entityPath) {
    return { valid: false, error: 'Missing EntityPath (Event Hub name) in connection string' };
  }

  return { valid: true };
}

/**
 * Cryptography utilities for SAS token generation
 * Based on Azure Portal's Event Hub Explorer implementation
 */
export namespace Cryptography {
  const textEncode = (text: string, isBase64?: boolean): ArrayBuffer => {
    const str = isBase64 ? window.atob(text) : text;
    const len = str.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  };

  const bufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  export function getHmacSha256(key: string, stringToHash: string): Promise<string> {
    const algorithm = { name: 'HMAC', hash: { name: 'SHA-256' } };

    const cryptoApi = window.crypto;
    return cryptoApi.subtle.importKey('raw', textEncode(key, true), algorithm, false, ['sign']).then((cryptoKey) => {
      const utf8 = unescape(encodeURIComponent(stringToHash));
      return cryptoApi.subtle.sign(algorithm, cryptoKey, textEncode(utf8)).then((signature) => bufferToBase64(signature));
    });
  }
}

/**
 * SAS Token generation for Azure Event Hubs
 * Based on Azure Portal's Event Hub Explorer implementation
 */
export interface SasKeys {
  keyName: string;
  primaryKey: string;
}

export namespace Authorization {
  export async function generateSasToken(uri: string, timeToLive: number, keys: SasKeys): Promise<string> {
    const encodedUri = encodeURIComponent(uri);
    const signature = encodedUri + '\n' + timeToLive;

    const hash = await Cryptography.getHmacSha256(Buffer.from(keys.primaryKey, 'utf8').toString('base64'), signature);
    const hashedSignature = encodeURIComponent(hash);
    const expiry = String(timeToLive);
    return `SharedAccessSignature sr=${encodedUri}&sig=${hashedSignature}&se=${expiry}&skn=${keys.keyName}`;
  }

  export async function createRuntimeSASToken(
    namespaceEndpoint: string,
    keyName: string,
    primaryKey: string,
    ttlSeconds: number = 3600
  ): Promise<string> {
    // Ensure the URI ends with /
    const authUri = namespaceEndpoint.endsWith('/') ? namespaceEndpoint : namespaceEndpoint + '/';
    const expiryTime = Math.floor(Date.now() / 1000) + ttlSeconds;

    const keys: SasKeys = {
      keyName: keyName,
      primaryKey: primaryKey,
    };

    return generateSasToken(authUri, expiryTime, keys);
  }
}

/**
 * Helper to stringify event body
 */
export function stringifyEventBody(body: unknown): string {
  if (body === undefined || body === null || body === '') {
    return '';
  }

  // Handle Uint8Array directly
  if (body instanceof Uint8Array) {
    try {
      const text = new TextDecoder().decode(body);
      // Try to parse as JSON for pretty printing
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return text;
      }
    } catch {
      return '[Binary Data]';
    }
  }

  // Handle Buffer-like objects (serialized buffers)
  if (body && typeof body === 'object' && 'type' in body) {
    const bufferLike = body as { type: unknown; data?: unknown };
    if (bufferLike.type === 'Buffer' && Array.isArray(bufferLike.data)) {
      try {
        const buffer = Buffer.from(bufferLike.data as number[]);
        const text = new TextDecoder().decode(buffer);
        try {
          const parsed = JSON.parse(text);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return text;
        }
      } catch {
        return '[Binary Data]';
      }
    }
  }

  // Handle objects
  if (typeof body === 'object') {
    try {
      return JSON.stringify(body, null, 2);
    } catch {
      return String(body);
    }
  }

  return String(body);
}
