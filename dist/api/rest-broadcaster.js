/**
 * REST API Broadcaster Client
 * Used when MCP SDK connects to an existing REST server
 * Broadcasts messages via HTTP POST instead of WebSocket
 */
import { logger } from '../utils/logger.js';
export class RestApiBroadcaster {
    port;
    constructor(port) {
        this.port = port;
    }
    hasVisualizerClients() {
        // Assume true - server will handle checking
        return true;
    }
    getVisualizerClientCount() {
        // Unknown - server manages this
        return 0;
    }
    broadcastToVisualizer(message) {
        // POST to server's broadcast endpoint
        const url = `http://localhost:${this.port}/api/broadcast`;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        }).catch(err => {
            logger.error('RestApiBroadcaster', 'Failed to broadcast', { error: String(err) });
        });
    }
    async stop() {
        // Nothing to stop - we're just a client
    }
}
//# sourceMappingURL=rest-broadcaster.js.map