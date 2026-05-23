import { logger } from "../logger";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  failureThreshold: number; // e.g. 5 failures
  resetTimeoutMs: number; // e.g. 30000 (30 seconds)
}

export class CircuitBreaker {
  public state: CircuitState = "CLOSED";
  public failureCount = 0;
  private nextAttemptAt = 0;
  private readonly name: string;
  private readonly options: CircuitBreakerOptions;

  constructor(name: string, options: CircuitBreakerOptions) {
    this.name = name;
    this.options = options;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() > this.nextAttemptAt) {
        this.state = "HALF_OPEN";
        logger.info({ provider: this.name }, "Circuit breaker entering HALF_OPEN state");
      } else {
        throw new Error(`Circuit breaker is OPEN for provider ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess() {
    if (this.state !== "CLOSED") {
      logger.info({ provider: this.name }, "Circuit breaker recovering to CLOSED state");
      this.state = "CLOSED";
    }
    this.failureCount = 0;
  }

  private onFailure(err: any) {
    this.failureCount += 1;
    logger.warn({ provider: this.name, failures: this.failureCount, err }, "Provider failure recorded");

    if (this.state === "HALF_OPEN" || this.failureCount >= this.options.failureThreshold) {
      this.state = "OPEN";
      this.nextAttemptAt = Date.now() + this.options.resetTimeoutMs;
      logger.error({ provider: this.name, resetTimeoutMs: this.options.resetTimeoutMs }, "Circuit breaker tripped to OPEN state");
    }
  }
  
  public isOpen(): boolean {
    if (this.state === "OPEN" && Date.now() > this.nextAttemptAt) {
        this.state = "HALF_OPEN";
        return false;
    }
    return this.state === "OPEN";
  }
}

export const razorpayBreaker = new CircuitBreaker("razorpay", {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 min
});

export const resendBreaker = new CircuitBreaker("resend", {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 min
});
