import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

/** Bind to 127.0.0.1 on a free port for isolated Modbus TCP integration tests. */
export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(address.port);
      });
    });
  });
}
