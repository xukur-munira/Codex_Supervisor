import { MemoryQueue } from '../dist/messaging/memory-queue.js';

function createMessage(content = {}) {
  return {
    id: '',
    timestamp: '',
    projectId: 'project-1',
    sessionId: 'session-1',
    type: 'system',
    subtype: 'project_start',
    content,
  };
}

describe('MemoryQueue', () => {
  it('connects and disconnects without external services', async () => {
    const queue = new MemoryQueue();

    await queue.connect();
    expect(queue.isConnected()).toBe(true);

    await queue.disconnect();
    expect(queue.isConnected()).toBe(false);
  });

  it('delivers published messages to subscribers and assigns metadata', async () => {
    const queue = new MemoryQueue();
    const received = [];

    await queue.connect();
    await queue.subscribe('project-1', (message) => {
      received.push(message);
    });
    await queue.publish('project-1', createMessage({ status: 'started' }));

    expect(received).toHaveLength(1);
    expect(received[0].id).toEqual(expect.any(String));
    expect(received[0].timestamp).toEqual(expect.any(String));
    expect(received[0].content).toEqual({ status: 'started' });
  });

  it('queues messages until a subscriber is attached', async () => {
    const queue = new MemoryQueue();
    const received = [];

    await queue.connect();
    await queue.publish('deferred-channel', createMessage({ status: 'queued' }));
    expect(queue.getQueueLength('deferred-channel')).toBe(1);

    await queue.subscribe('deferred-channel', (message) => {
      received.push(message);
    });

    expect(received).toHaveLength(1);
    expect(queue.getQueueLength('deferred-channel')).toBe(0);
  });
});
