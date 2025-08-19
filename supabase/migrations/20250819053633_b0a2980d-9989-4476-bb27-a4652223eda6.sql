-- Create rosters table to store cleaning roster sessions
CREATE TABLE public.rosters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create members table to store participants for each roster
CREATE TABLE public.roster_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roster_id UUID NOT NULL REFERENCES public.rosters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create assignments table to store weekly cleaning assignments
CREATE TABLE public.cleaning_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roster_id UUID NOT NULL REFERENCES public.rosters(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.roster_members(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL, -- The Sunday of the week
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security (but allow public access for demo)
ALTER TABLE public.rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Allow public access to rosters" 
ON public.rosters 
FOR ALL 
USING (true);

CREATE POLICY "Allow public access to roster_members" 
ON public.roster_members 
FOR ALL 
USING (true);

CREATE POLICY "Allow public access to cleaning_assignments" 
ON public.cleaning_assignments 
FOR ALL 
USING (true);

-- Create indexes for better performance
CREATE INDEX idx_roster_members_roster_id ON public.roster_members(roster_id);
CREATE INDEX idx_cleaning_assignments_roster_id ON public.cleaning_assignments(roster_id);
CREATE INDEX idx_cleaning_assignments_date ON public.cleaning_assignments(assignment_date);