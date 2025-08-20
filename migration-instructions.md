# Database Migration Instructions

## Task Completion and Swapping Features

I've implemented task completion tracking and task swapping functionality for the cleaning roster application. To enable these features, you need to run the database migration.

### Migration File
The migration file `supabase/migrations/20250820000000_add_task_management.sql` has been created with the following changes:

1. **Task Completion Tracking**:
   - `is_completed`: Boolean flag to mark tasks as completed
   - `completed_at`: Timestamp when the task was completed
   - `completed_by`: Reference to the member who marked it complete

2. **Task Swapping**:
   - `swapped_with`: Reference to the member this task was swapped with
   - `swap_requested_at`: When the swap was requested
   - `swap_requested_by`: Who requested the swap
   - `swap_status`: Status of the swap request (pending, accepted, rejected, cancelled)

### Running the Migration

#### Option 1: Using Supabase CLI (Recommended)
1. Install Supabase CLI: `npm install -g supabase`
2. Run: `supabase db push`

#### Option 2: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/20250820000000_add_task_management.sql`
4. Execute the SQL

#### Option 3: Using npm/bun
```bash
# If using npm
npx supabase db push

# If using bun
bunx supabase db push
```

### New Features Added

1. **Task Completion**:
   - Mark tasks as completed/incomplete
   - Visual indicators for completed tasks
   - Completion timestamps and tracking

2. **Task Swapping**:
   - Request task swaps with other members
   - Accept/reject swap requests
   - Visual status indicators for pending swaps

3. **Enhanced UI**:
   - New Status column showing task completion and swap status
   - Actions column with dropdown menus for task management
   - Visual indicators (checkmarks, icons) for different states

### How to Use

1. **Mark Task Complete**: Click the dropdown menu next to a task and select "Mark Complete"
2. **Mark Task Incomplete**: Click the dropdown menu and select "Mark Incomplete" to reopen a completed task
3. **Request Swap**: Click "Request Swap" to initiate a swap request (feature placeholder for now)
4. **Respond to Swap**: If there's a pending swap request, you can accept or reject it

### Notes

- The swap request feature currently shows a placeholder message. In a full implementation, you would add a modal to select which member to swap with.
- Task completion status is preserved when saving/loading rosters.
- The UI automatically refreshes to show updated status after any action.

### Troubleshooting

If you encounter issues:
1. Make sure your Supabase project is properly configured
2. Check that the migration file exists in the correct location
3. Verify that your database connection is working
4. Check the browser console for any JavaScript errors
