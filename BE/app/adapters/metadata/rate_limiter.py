import asyncio
import time
import logging

logger = logging.getLogger(__name__)


class TokenBucketRateLimiter:
    """
    Asynchronous token-bucket rate limiter for external metadata APIs.
    Guarantees outbound HTTP request rates do not exceed vendor quotas.
    """

    def __init__(self, rate_per_second: float, capacity: float = None):
        self.rate = float(rate_per_second)
        self.capacity = float(capacity) if capacity is not None else max(1.0, float(rate_per_second))
        self.tokens = self.capacity
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: float = 1.0) -> None:
        """
        Acquires tokens from the bucket, sleeping if necessary.
        """
        while True:
            async with self._lock:
                now = time.monotonic()
                elapsed = now - self.last_refill
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
                self.last_refill = now

                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return
                
                # Calculate sleep time needed to get remaining tokens
                deficit = tokens - self.tokens
                sleep_time = deficit / self.rate

            await asyncio.sleep(max(0.01, sleep_time))
