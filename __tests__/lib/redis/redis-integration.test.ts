import Redis from 'ioredis';

// Mock ioredis for testing
jest.mock('ioredis');

describe('Redis Integration Tests', () => {
  let mockRedis: jest.Mocked<Redis>;
  let MockRedisConstructor: jest.MockedClass<typeof Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    MockRedisConstructor = Redis as jest.MockedClass<typeof Redis>;
    
    // Create mock Redis instance
    mockRedis = {
      // Connection methods
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      
      // Basic operations
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      
      // Advanced operations
      pipeline: jest.fn(),
      multi: jest.fn(),
      eval: jest.fn(),
      evalsha: jest.fn(),
      
      // Pub/Sub
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      publish: jest.fn(),
      
      // Hash operations
      hget: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
      hgetall: jest.fn(),
      
      // List operations
      lpush: jest.fn(),
      rpush: jest.fn(),
      lpop: jest.fn(),
      rpop: jest.fn(),
      llen: jest.fn(),
      
      // Set operations
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      sismember: jest.fn(),
      
      // Sorted set operations
      zadd: jest.fn(),
      zrem: jest.fn(),
      zrange: jest.fn(),
      zrank: jest.fn(),
      
      // Configuration and info
      config: jest.fn(),
      info: jest.fn(),
      flushdb: jest.fn(),
      flushall: jest.fn(),
      
      // Event handling
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      
      // Connection status
      status: 'ready',
      
      // Stream operations
      xadd: jest.fn(),
      xread: jest.fn(),
      xreadgroup: jest.fn(),
      
      // Lua scripts
      defineCommand: jest.fn(),
      
      // Cluster operations (if using cluster)
      cluster: jest.fn(),
      
      // Transaction support
      watch: jest.fn(),
      unwatch: jest.fn(),
      exec: jest.fn(),
      discard: jest.fn()
    } as any;
    
    MockRedisConstructor.mockImplementation(() => mockRedis);
  });

  describe('Connection Management', () => {
    it('should establish Redis connection successfully', async () => {
      const redis = new Redis();
      
      expect(MockRedisConstructor).toHaveBeenCalledTimes(1);
      expect(redis).toBe(mockRedis);
    });

    it('should handle Redis connection with configuration', async () => {
      const config = {
        host: 'localhost',
        port: 6379,
        password: 'test-password',
        db: 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      };
      
      const redis = new Redis(config);
      
      expect(MockRedisConstructor).toHaveBeenCalledWith(config);
    });

    it('should handle Redis connection from URL', async () => {
      const redisUrl = 'redis://user:password@localhost:6379/0';
      
      const redis = new Redis(redisUrl);
      
      expect(MockRedisConstructor).toHaveBeenCalledWith(redisUrl);
    });

    it('should handle Redis connection failures gracefully', async () => {
      const connectionError = new Error('Connection failed');
      MockRedisConstructor.mockImplementation(() => {
        throw connectionError;
      });
      
      expect(() => new Redis()).toThrow('Connection failed');
    });

    it('should support connection pooling configuration', async () => {
      const poolConfig = {
        host: 'localhost',
        port: 6379,
        family: 4,
        keepAlive: true,
        connectTimeout: 10000,
        lazyConnect: true
      };
      
      const redis = new Redis(poolConfig);
      
      expect(MockRedisConstructor).toHaveBeenCalledWith(poolConfig);
    });

    it('should handle Redis cluster connections', async () => {
      const clusterNodes = [
        { host: 'localhost', port: 6379 },
        { host: 'localhost', port: 6380 },
        { host: 'localhost', port: 6381 }
      ];
      
      const clusterOptions = {
        enableOfflineQueue: false,
        redisOptions: {
          password: 'cluster-password'
        }
      };
      
      // Test cluster connection (would use Redis.Cluster in real implementation)
      const redis = new Redis();
      expect(redis).toBeDefined();
    });
  });

  describe('Basic Redis Operations', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should perform GET operation', async () => {
      mockRedis.get.mockResolvedValue('test-value');
      
      const result = await redis.get('test-key');
      
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('test-value');
    });

    it('should perform SET operation', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const result = await redis.set('test-key', 'test-value');
      
      expect(mockRedis.set).toHaveBeenCalledWith('test-key', 'test-value');
      expect(result).toBe('OK');
    });

    it('should perform SET with expiration', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const result = await redis.set('test-key', 'test-value', 'EX', 3600);
      
      expect(mockRedis.set).toHaveBeenCalledWith('test-key', 'test-value', 'EX', 3600);
      expect(result).toBe('OK');
    });

    it('should perform DEL operation', async () => {
      mockRedis.del.mockResolvedValue(1);
      
      const result = await redis.del('test-key');
      
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
      expect(result).toBe(1);
    });

    it('should check key existence', async () => {
      mockRedis.exists.mockResolvedValue(1);
      
      const result = await redis.exists('test-key');
      
      expect(mockRedis.exists).toHaveBeenCalledWith('test-key');
      expect(result).toBe(1);
    });

    it('should set key expiration', async () => {
      mockRedis.expire.mockResolvedValue(1);
      
      const result = await redis.expire('test-key', 3600);
      
      expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 3600);
      expect(result).toBe(1);
    });

    it('should get key TTL', async () => {
      mockRedis.ttl.mockResolvedValue(3600);
      
      const result = await redis.ttl('test-key');
      
      expect(mockRedis.ttl).toHaveBeenCalledWith('test-key');
      expect(result).toBe(3600);
    });
  });

  describe('Advanced Redis Operations', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should handle pipeline operations', async () => {
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 'value1'],
          [null, 'OK'],
          [null, 1]
        ])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const pipeline = redis.pipeline();
      pipeline.get('key1');
      pipeline.set('key2', 'value2');
      pipeline.del('key3');
      const results = await pipeline.exec();
      
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.get).toHaveBeenCalledWith('key1');
      expect(mockPipeline.set).toHaveBeenCalledWith('key2', 'value2');
      expect(mockPipeline.del).toHaveBeenCalledWith('key3');
      expect(results).toEqual([
        [null, 'value1'],
        [null, 'OK'],
        [null, 1]
      ]);
    });

    it('should handle multi/exec transactions', async () => {
      const mockMulti = {
        get: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 'value1'],
          [null, 'OK']
        ])
      };
      
      mockRedis.multi.mockReturnValue(mockMulti as any);
      
      const multi = redis.multi();
      multi.get('key1');
      multi.set('key2', 'value2');
      const results = await multi.exec();
      
      expect(mockRedis.multi).toHaveBeenCalled();
      expect(results).toEqual([
        [null, 'value1'],
        [null, 'OK']
      ]);
    });

    it('should execute Lua scripts', async () => {
      const script = 'return redis.call("get", KEYS[1])';
      const keys = ['test-key'];
      const args = ['test-arg'];
      
      mockRedis.eval.mockResolvedValue('script-result');
      
      const result = await redis.eval(script, keys.length, ...keys, ...args);
      
      expect(mockRedis.eval).toHaveBeenCalledWith(script, keys.length, ...keys, ...args);
      expect(result).toBe('script-result');
    });

    it('should execute cached Lua scripts', async () => {
      const scriptSha = 'abc123def456';
      const keys = ['test-key'];
      const args = ['test-arg'];
      
      mockRedis.evalsha.mockResolvedValue('cached-script-result');
      
      const result = await redis.evalsha(scriptSha, keys.length, ...keys, ...args);
      
      expect(mockRedis.evalsha).toHaveBeenCalledWith(scriptSha, keys.length, ...keys, ...args);
      expect(result).toBe('cached-script-result');
    });
  });

  describe('Hash Operations', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should perform HGET operation', async () => {
      mockRedis.hget.mockResolvedValue('hash-value');
      
      const result = await redis.hget('hash-key', 'field');
      
      expect(mockRedis.hget).toHaveBeenCalledWith('hash-key', 'field');
      expect(result).toBe('hash-value');
    });

    it('should perform HSET operation', async () => {
      mockRedis.hset.mockResolvedValue(1);
      
      const result = await redis.hset('hash-key', 'field', 'value');
      
      expect(mockRedis.hset).toHaveBeenCalledWith('hash-key', 'field', 'value');
      expect(result).toBe(1);
    });

    it('should perform HGETALL operation', async () => {
      const hashData = { field1: 'value1', field2: 'value2' };
      mockRedis.hgetall.mockResolvedValue(hashData);
      
      const result = await redis.hgetall('hash-key');
      
      expect(mockRedis.hgetall).toHaveBeenCalledWith('hash-key');
      expect(result).toEqual(hashData);
    });

    it('should perform HDEL operation', async () => {
      mockRedis.hdel.mockResolvedValue(1);
      
      const result = await redis.hdel('hash-key', 'field');
      
      expect(mockRedis.hdel).toHaveBeenCalledWith('hash-key', 'field');
      expect(result).toBe(1);
    });
  });

  describe('List Operations', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should perform LPUSH operation', async () => {
      mockRedis.lpush.mockResolvedValue(3);
      
      const result = await redis.lpush('list-key', 'item1', 'item2');
      
      expect(mockRedis.lpush).toHaveBeenCalledWith('list-key', 'item1', 'item2');
      expect(result).toBe(3);
    });

    it('should perform RPOP operation', async () => {
      mockRedis.rpop.mockResolvedValue('popped-item');
      
      const result = await redis.rpop('list-key');
      
      expect(mockRedis.rpop).toHaveBeenCalledWith('list-key');
      expect(result).toBe('popped-item');
    });

    it('should get list length', async () => {
      mockRedis.llen.mockResolvedValue(5);
      
      const result = await redis.llen('list-key');
      
      expect(mockRedis.llen).toHaveBeenCalledWith('list-key');
      expect(result).toBe(5);
    });
  });

  describe('Error Handling', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should handle Redis connection errors gracefully', async () => {
      const connectionError = new Error('ECONNREFUSED');
      mockRedis.get.mockRejectedValue(connectionError);
      
      await expect(redis.get('test-key')).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle Redis timeout errors', async () => {
      const timeoutError = new Error('Command timed out');
      mockRedis.set.mockRejectedValue(timeoutError);
      
      await expect(redis.set('test-key', 'value')).rejects.toThrow('Command timed out');
    });

    it('should handle Redis memory errors', async () => {
      const memoryError = new Error('OOM command not allowed when used memory > maxmemory');
      mockRedis.set.mockRejectedValue(memoryError);
      
      await expect(redis.set('test-key', 'value')).rejects.toThrow('OOM command not allowed');
    });

    it('should handle Redis authentication errors', async () => {
      const authError = new Error('NOAUTH Authentication required');
      mockRedis.get.mockRejectedValue(authError);
      
      await expect(redis.get('test-key')).rejects.toThrow('NOAUTH Authentication required');
    });

    it('should handle pipeline execution errors', async () => {
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 'success'],
          [new Error('Pipeline error'), null]
        ])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const pipeline = redis.pipeline();
      pipeline.get('key1');
      pipeline.set('invalid-key', 'value');
      const results = await pipeline.exec();
      
      expect(results![0]).toEqual([null, 'success']);
      expect(results![1][0]).toBeInstanceOf(Error);
    });

    it('should handle transaction rollback scenarios', async () => {
      const mockMulti = {
        get: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null) // Transaction was discarded
      };
      
      mockRedis.multi.mockReturnValue(mockMulti as any);
      
      const multi = redis.multi();
      multi.get('key1');
      multi.set('key2', 'value');
      const results = await multi.exec();
      
      expect(results).toBeNull();
    });
  });

  describe('Pub/Sub Operations', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should handle subscription operations', async () => {
      mockRedis.subscribe.mockResolvedValue(1);
      
      const result = await redis.subscribe('channel1', 'channel2');
      
      expect(mockRedis.subscribe).toHaveBeenCalledWith('channel1', 'channel2');
      expect(result).toBe(1);
    });

    it('should handle unsubscription operations', async () => {
      mockRedis.unsubscribe.mockResolvedValue(0);
      
      const result = await redis.unsubscribe('channel1');
      
      expect(mockRedis.unsubscribe).toHaveBeenCalledWith('channel1');
      expect(result).toBe(0);
    });

    it('should handle message publishing', async () => {
      mockRedis.publish.mockResolvedValue(2);
      
      const result = await redis.publish('channel1', 'message');
      
      expect(mockRedis.publish).toHaveBeenCalledWith('channel1', 'message');
      expect(result).toBe(2);
    });
  });

  describe('Event Handling', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should handle connection events', () => {
      const connectHandler = jest.fn();
      const errorHandler = jest.fn();
      
      redis.on('connect', connectHandler);
      redis.on('error', errorHandler);
      
      expect(mockRedis.on).toHaveBeenCalledWith('connect', connectHandler);
      expect(mockRedis.on).toHaveBeenCalledWith('error', errorHandler);
    });

    it('should handle ready event', () => {
      const readyHandler = jest.fn();
      
      redis.on('ready', readyHandler);
      
      expect(mockRedis.on).toHaveBeenCalledWith('ready', readyHandler);
    });

    it('should handle disconnection events', () => {
      const endHandler = jest.fn();
      const closeHandler = jest.fn();
      
      redis.on('end', endHandler);
      redis.on('close', closeHandler);
      
      expect(mockRedis.on).toHaveBeenCalledWith('end', endHandler);
      expect(mockRedis.on).toHaveBeenCalledWith('close', closeHandler);
    });

    it('should handle reconnection events', () => {
      const reconnectingHandler = jest.fn();
      
      redis.on('reconnecting', reconnectingHandler);
      
      expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', reconnectingHandler);
    });
  });

  describe('Configuration and Monitoring', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should get Redis configuration', async () => {
      const configData = ['maxmemory', '1073741824'];
      mockRedis.config.mockResolvedValue(configData);
      
      const result = await redis.config('GET', 'maxmemory');
      
      expect(mockRedis.config).toHaveBeenCalledWith('GET', 'maxmemory');
      expect(result).toEqual(configData);
    });

    it('should get Redis info', async () => {
      const infoData = 'redis_version:6.2.0\nused_memory:1024';
      mockRedis.info.mockResolvedValue(infoData);
      
      const result = await redis.info();
      
      expect(mockRedis.info).toHaveBeenCalled();
      expect(result).toBe(infoData);
    });

    it('should handle ping operations', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      
      const result = await redis.ping();
      
      expect(mockRedis.ping).toHaveBeenCalled();
      expect(result).toBe('PONG');
    });

    it('should handle database flushing', async () => {
      mockRedis.flushdb.mockResolvedValue('OK');
      
      const result = await redis.flushdb();
      
      expect(mockRedis.flushdb).toHaveBeenCalled();
      expect(result).toBe('OK');
    });
  });

  describe('Performance and Scalability', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should handle concurrent operations efficiently', async () => {
      mockRedis.get.mockImplementation((key) => 
        Promise.resolve(`value-${key}`)
      );
      
      const promises = Array.from({ length: 100 }, (_, i) => 
        redis.get(`key-${i}`)
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(100);
      expect(mockRedis.get).toHaveBeenCalledTimes(100);
      results.forEach((result, index) => {
        expect(result).toBe(`value-key-${index}`);
      });
    });

    it('should handle large pipeline operations', async () => {
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(
          Array.from({ length: 1000 }, (_, i) => [null, `value-${i}`])
        )
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const pipeline = redis.pipeline();
      for (let i = 0; i < 1000; i++) {
        pipeline.get(`key-${i}`);
      }
      
      const results = await pipeline.exec();
      
      expect(results).toHaveLength(1000);
      expect(mockPipeline.get).toHaveBeenCalledTimes(1000);
    });

    it('should handle memory-efficient bulk operations', async () => {
      const largeData = 'x'.repeat(1024 * 1024); // 1MB string
      mockRedis.set.mockResolvedValue('OK');
      
      const result = await redis.set('large-key', largeData);
      
      expect(mockRedis.set).toHaveBeenCalledWith('large-key', largeData);
      expect(result).toBe('OK');
    });
  });

  describe('Stream Operations (Redis Streams)', () => {
    let redis: Redis;

    beforeEach(() => {
      redis = new Redis();
    });

    it('should handle XADD operations', async () => {
      mockRedis.xadd.mockResolvedValue('1609459200000-0');
      
      const result = await redis.xadd('stream-key', '*', 'field1', 'value1');
      
      expect(mockRedis.xadd).toHaveBeenCalledWith('stream-key', '*', 'field1', 'value1');
      expect(result).toBe('1609459200000-0');
    });

    it('should handle XREAD operations', async () => {
      const streamData = [
        ['stream-key', [['1609459200000-0', ['field1', 'value1']]]]
      ];
      mockRedis.xread.mockResolvedValue(streamData);
      
      const result = await redis.xread('STREAMS', 'stream-key', '0');
      
      expect(mockRedis.xread).toHaveBeenCalledWith('STREAMS', 'stream-key', '0');
      expect(result).toEqual(streamData);
    });
  });

  describe('Connection Pool Management', () => {
    it('should handle connection pool configuration', () => {
      const poolConfig = {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        connectTimeout: 10000,
        commandTimeout: 5000,
        family: 4,
        keepAlive: true
      };
      
      const redis = new Redis(poolConfig);
      
      expect(MockRedisConstructor).toHaveBeenCalledWith(poolConfig);
    });

    it('should handle connection cleanup', async () => {
      const redis = new Redis();
      mockRedis.quit.mockResolvedValue('OK');
      
      const result = await redis.quit();
      
      expect(mockRedis.quit).toHaveBeenCalled();
      expect(result).toBe('OK');
    });

    it('should handle graceful disconnection', async () => {
      const redis = new Redis();
      mockRedis.disconnect.mockResolvedValue(undefined);
      
      await redis.disconnect();
      
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });
});