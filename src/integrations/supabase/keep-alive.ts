import { supabase } from './client';

/**
 * Keep-alive utility to prevent Supabase database from going to sleep
 * This performs a harmless query to keep the connection active
 */
export class SupabaseKeepAlive {
  private intervalId: NodeJS.Timeout | null = null;
  private isActive = false;

  /**
   * Start the keep-alive mechanism
   * @param intervalMinutes - How often to ping (default: 60 minutes)
   */
  start(intervalMinutes: number = 60): void {
    if (this.isActive) {
      console.warn('Keep-alive is already running');
      return;
    }

    this.isActive = true;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Initial ping
    this.ping();

    // Set up recurring ping
    this.intervalId = setInterval(() => {
      this.ping();
    }, intervalMs);

    console.log(`Supabase keep-alive started (pinging every ${intervalMinutes} minutes)`);
  }

  /**
   * Stop the keep-alive mechanism
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isActive = false;
    console.log('Supabase keep-alive stopped');
  }

  /**
   * Perform a harmless ping query using the rosters table
   */
  private async ping(): Promise<void> {
    try {
      // Use a simple count query on the rosters table - this is harmless and efficient
      const { count, error } = await supabase
        .from('rosters')
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.warn('Keep-alive ping warning:', error.message);
      } else {
        console.log(`Supabase keep-alive ping successful - ${count} rosters found`);
      }
    } catch (error) {
      console.warn('Keep-alive ping failed:', error);
    }
  }

  /**
   * Check if keep-alive is currently running
   */
  get isRunning(): boolean {
    return this.isActive;
  }
}

// Create a singleton instance
export const supabaseKeepAlive = new SupabaseKeepAlive();

// Auto-start when imported (optional - you can also start manually)
// supabaseKeepAlive.start(60); // Ping every hour
