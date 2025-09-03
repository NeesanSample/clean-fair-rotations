# Supabase Keep-Alive Solution

This project includes a comprehensive solution to prevent your Supabase database from going into sleep mode when not in use.

## Problem

Supabase automatically puts databases into a "sleep/locked" state after periods of inactivity. This can cause:
- Slow initial response times when the database wakes up
- Potential connection timeouts
- Poor user experience

## Solutions Implemented

### 1. Client-Side Keep-Alive (Automatic)

The app automatically keeps the database alive while users are actively using it:

- **Location**: `src/integrations/supabase/keep-alive.ts`
- **Hook**: `src/hooks/use-keep-alive.tsx`
- **Integration**: Automatically started in `src/App.tsx`
- **Frequency**: Pings every 60 minutes by default
- **Query**: Performs a harmless `SELECT COUNT(*)` on the `rosters` table

### 2. Server-Side Edge Function (Recommended for Production)

A Supabase Edge Function that can be called by external cron services:

- **Location**: `supabase/functions/keep-alive/`
- **Endpoint**: `/functions/v1/keep-alive`
- **Query**: Same harmless database ping
- **CORS**: Enabled for external access

## Setup Instructions

### Client-Side (Already Configured)

The client-side keep-alive is already integrated and will work automatically. No additional setup required.

### Server-Side Edge Function

1. **Deploy the Edge Function**:
   ```bash
   # Navigate to your project directory
   cd supabase
   
   # Deploy the function
   supabase functions deploy keep-alive
   ```

2. **Set Environment Variables** (if not already set):
   ```bash
   supabase secrets set SUPABASE_URL=https://your-project.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **Test the Function**:
   ```bash
   curl "https://your-project.supabase.co/functions/v1/keep-alive"
   ```

## External Cron Job Setup

### Option 1: GitHub Actions (Free)

Create `.github/workflows/keep-alive.yml`:

```yaml
name: Supabase Keep-Alive
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Manual trigger

jobs:
  keep-alive:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: |
          curl -X POST "https://your-project.supabase.co/functions/v1/keep-alive"
```

### Option 2: Cron-job.org (Free)

1. Go to [cron-job.org](https://cron-job.org)
2. Create a new cron job
3. Set URL: `https://your-project.supabase.co/functions/v1/keep-alive`
4. Set schedule: Every 6 hours (or daily)
5. Save and activate

### Option 3: UptimeRobot (Free)

1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Create a new monitor
3. Set type to "HTTP(s)"
4. Set URL: `https://your-project.supabase.co/functions/v1/keep-alive`
5. Set check interval: 6 hours
6. Save

## Configuration Options

### Client-Side Keep-Alive

```typescript
import { useKeepAlive } from '@/hooks/use-keep-alive';

// Custom interval (30 minutes)
useKeepAlive({ intervalMinutes: 30 });

// Manual control
const { start, stop, isRunning } = useKeepAlive({ 
  autoStart: false,
  autoStop: false 
});
```

### Edge Function Customization

Edit `supabase/functions/keep-alive/index.ts` to:
- Change the ping query
- Add authentication
- Modify response format
- Add logging

## Monitoring

### Client-Side Logs

Check browser console for keep-alive activity:
```
Supabase keep-alive started (pinging every 60 minutes)
Supabase keep-alive ping successful - 5 rosters found
```

### Edge Function Logs

View logs in Supabase Dashboard:
1. Go to your project dashboard
2. Navigate to Edge Functions
3. Select the `keep-alive` function
4. View logs and invocations

## Best Practices

1. **Frequency**: Ping every 6-24 hours (not too frequent to avoid costs)
2. **Query**: Use lightweight queries (COUNT, simple SELECT)
3. **Monitoring**: Set up alerts for failed keep-alive attempts
4. **Fallback**: Use both client and server solutions for redundancy

## Troubleshooting

### Common Issues

1. **Function not deploying**: Check Supabase CLI version and project linking
2. **CORS errors**: Verify the function is deployed and accessible
3. **Authentication errors**: Check service role key permissions
4. **Database errors**: Ensure the `rosters` table exists

### Testing

Test the keep-alive manually:
```bash
# Test Edge Function
curl "https://your-project.supabase.co/functions/v1/keep-alive"

# Check client-side in browser console
# Look for keep-alive messages
```

## Cost Considerations

- **Client-side**: No additional cost (uses existing connections)
- **Edge Function**: Minimal cost (~$0.0000002 per invocation)
- **Cron services**: Most are free for reasonable intervals

## Security Notes

- The Edge Function uses your service role key (keep it secret)
- CORS is enabled for external access (required for cron jobs)
- The function only performs read operations (safe)
- Consider adding authentication if needed

## Support

If you encounter issues:
1. Check the Supabase logs
2. Verify environment variables
3. Test the function manually
4. Check cron job configuration
