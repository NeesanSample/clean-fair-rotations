-- Add task completion and swapping functionality to cleaning assignments
ALTER TABLE public.cleaning_assignments 
ADD COLUMN is_completed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN completed_by UUID REFERENCES public.roster_members(id),
ADD COLUMN swapped_with UUID REFERENCES public.roster_members(id),
ADD COLUMN swap_requested_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN swap_requested_by UUID REFERENCES public.roster_members(id),
ADD COLUMN swap_status TEXT CHECK (swap_status IN ('pending', 'accepted', 'rejected', 'cancelled')) DEFAULT NULL;

-- Create indexes for the new columns
CREATE INDEX idx_cleaning_assignments_completed ON public.cleaning_assignments(is_completed);
CREATE INDEX idx_cleaning_assignments_swap_status ON public.cleaning_assignments(swap_status);

-- Add comments for documentation
COMMENT ON COLUMN public.cleaning_assignments.is_completed IS 'Whether the cleaning task has been completed';
COMMENT ON COLUMN public.cleaning_assignments.completed_at IS 'When the task was marked as completed';
COMMENT ON COLUMN public.cleaning_assignments.completed_by IS 'Which member marked the task as completed';
COMMENT ON COLUMN public.cleaning_assignments.swapped_with IS 'Member ID this task was swapped with';
COMMENT ON COLUMN public.cleaning_assignments.swap_requested_at IS 'When the swap was requested';
COMMENT ON COLUMN public.cleaning_assignments.swap_requested_by IS 'Who requested the swap';
COMMENT ON COLUMN public.cleaning_assignments.swap_status IS 'Status of the swap request: pending, accepted, rejected, or cancelled';
