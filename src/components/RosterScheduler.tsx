import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Users, Calendar as CalendarDays, Clock, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Member {
  id: string;
  name: string;
  color: string;
}

interface Assignment {
  date: string;
  members: string[];
}

export const RosterScheduler = () => {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [members, setMembers] = useState<Member[]>([]);
  const [newMemberName, setNewMemberName] = useState("");
  const [rosterName, setRosterName] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [previewWeeks, setPreviewWeeks] = useState<string[][]>([]);
  
  const { toast } = useToast();

  // Color helpers
  const generateColorForIndex = (index: number): string => {
    const goldenAngle = 137.508; // distributes hues nicely
    const hue = (index * goldenAngle) % 360;
    // Higher contrast palette: higher saturation, slightly darker lightness
    return `hsl(${hue} 80% 40%)`;
  };

  const getTextColorForBg = (hslColor: string): string => {
    try {
      const inside = hslColor.substring(hslColor.indexOf("(") + 1, hslColor.indexOf(")"));
      const parts = inside.split(/\s+/);
      const lightness = parseFloat(parts[2]?.replace('%', '') || '45');
      return lightness >= 55 ? '#111827' : 'white';
    } catch {
      return 'white';
    }
  };

  const avatarUrlForName = (name: string): string => {
    return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`;
  };

  const addMember = () => {
    if (newMemberName.trim()) {
      const newMember: Member = {
        id: (typeof window !== 'undefined' && (window as any).crypto && (window as any).crypto.randomUUID)
          ? (window as any).crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: newMemberName.trim(),
        color: generateColorForIndex(members.length)
      };
      setMembers([...members, newMember]);
      setNewMemberName("");
    }
  };

  const calculateWeeksNeeded = () => {
    const m = members.length;
    if (m < 2) return 0;
    // Minimal weeks so that (2 * weeks) is divisible by m
    // => weeks = lcm(m, 2) / 2, which is m/2 if m is even, else m
    return m % 2 === 0 ? Math.floor(m / 2) : m;
  };

  const memberIdToName = useMemo(() => {
    const map: { [key: string]: string } = {};
    members.forEach(m => { map[m.id] = m.name; });
    return map;
  }, [members]);

  const memberIdToColor = useMemo(() => {
    const map: { [key: string]: string } = {};
    members.forEach(m => { map[m.id] = m.color; });
    return map;
  }, [members]);

  const memberNameToColor = useMemo(() => {
    const map: { [key: string]: string } = {};
    members.forEach(m => { map[m.name] = m.color; });
    return map;
  }, [members]);

  const generateBalancedPreview = (weeks: number) => {
    if (members.length < 2 || weeks <= 0) return [] as string[][];
    // If multiple weeks and fewer than 4 members, non-consecutive is not feasible across weeks.
    const effectiveWeeks = weeks > 1 && members.length < 4 ? 1 : weeks;
    const counts: { [id: string]: number } = {};
    const lastAssignedWeek: { [id: string]: number } = {};
    members.forEach(m => { counts[m.id] = 0; lastAssignedWeek[m.id] = -2; });

    const result: string[][] = [];
    for (let week = 0; week < effectiveWeeks; week++) {
      const available = members
        .filter(m => lastAssignedWeek[m.id] < week - 1)
        .sort((a, b) => {
          const diff = counts[a.id] - counts[b.id];
          if (diff !== 0) return diff;
          return lastAssignedWeek[a.id] - lastAssignedWeek[b.id];
        });
      if (available.length < 2) break;
      const chosen = [available[0].id, available[1].id];
      chosen.forEach(id => { counts[id]++; lastAssignedWeek[id] = week; });
      result.push(chosen);
    }
    return result;
  };

  useEffect(() => {
    if (members.length >= 2) {
      setPreviewWeeks(generateBalancedPreview(calculateWeeksNeeded()));
    } else {
      setPreviewWeeks([]);
    }
    // Clear final assignments when team changes
    setAssignments([]);
  }, [members]);

  const removeMember = (id: string) => {
    setMembers(members.filter(member => member.id !== id));
  };

  const getSundays = (start: Date, end: Date): Date[] => {
    const sundays: Date[] = [];
    const current = new Date(start);
    
    // Find the first Sunday
    while (current.getDay() !== 0) {
      current.setDate(current.getDate() + 1);
    }
    
    // Collect all Sundays until end date
    while (current <= end) {
      sundays.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }
    
    return sundays;
  };

  const generateSchedule = () => {
    if (!startDate || !endDate || members.length < 2) {
      toast({
        title: "Invalid Input",
        description: "Please select date range and add at least 2 members",
        variant: "destructive"
      });
      return;
    }

    const sundays = getSundays(startDate, endDate);
    if (sundays.length === 0) {
      toast({
        title: "No Sundays Found",
        description: "No Sundays found in the selected date range",
        variant: "destructive"
      });
      return;
    }

    // Validate feasibility for non-consecutive rule
    const totalWeeks = sundays.length;
    if (totalWeeks > 1 && members.length < 4) {
      toast({
        title: "Not Enough Members",
        description: "For multiple weeks, at least 4 members are required to avoid consecutive assignments.",
        variant: "destructive"
      });
      return;
    }

    // Balanced (not necessarily perfectly equal) assignment respecting no-consecutive rule
    const counts: { [id: string]: number } = {};
    const lastAssigned: { [id: string]: number } = {};
    members.forEach(m => { counts[m.id] = 0; lastAssigned[m.id] = -2; });

    const newAssignments: Assignment[] = [];

    for (let weekIndex = 0; weekIndex < sundays.length; weekIndex++) {
      const availableMembers = members
        .filter(m => lastAssigned[m.id] < weekIndex - 1)
        .sort((a, b) => {
          const diff = counts[a.id] - counts[b.id];
          if (diff !== 0) return diff;
          return lastAssigned[a.id] - lastAssigned[b.id];
        });

      if (availableMembers.length < 2) {
        toast({
          title: "Scheduling Conflict",
          description: `Could not assign 2 members for week ${weekIndex + 1} without violating rules. Add more members or adjust dates.`,
          variant: "destructive"
        });
        return;
      }

      const chosen = [availableMembers[0], availableMembers[1]];
      chosen.forEach(m => { counts[m.id]++; lastAssigned[m.id] = weekIndex; });

      newAssignments.push({
        date: format(sundays[weekIndex], "yyyy-MM-dd"),
        members: chosen.map(c => c.name)
      });
    }

    setAssignments(newAssignments);
    
    toast({
      title: "Schedule Generated",
      description: `Generated cleaning schedule for ${sundays.length} weeks`
    });
  };

  const calculateSelectedWeeks = () => {
    if (!startDate || !endDate) return 0;
    return getSundays(startDate, endDate).length;
  };

  const saveRoster = async () => {
    if (!rosterName.trim() || !startDate || !endDate || assignments.length === 0) {
      toast({
        title: "Cannot Save",
        description: "Please provide roster name and generate schedule first",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // Create roster
      const { data: roster, error: rosterError } = await supabase
        .from('rosters')
        .insert({
          name: rosterName.trim(),
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd")
        })
        .select()
        .single();

      if (rosterError) throw rosterError;

      // Create members
      const memberInserts = members.map(member => ({
        roster_id: roster.id,
        name: member.name
      }));

      const { data: savedMembers, error: membersError } = await supabase
        .from('roster_members')
        .insert(memberInserts)
        .select();

      if (membersError) throw membersError;

      // Create name to ID mapping
      const memberNameToId: { [key: string]: string } = {};
      savedMembers.forEach(member => {
        memberNameToId[member.name] = member.id;
      });

      // Create assignments
      const assignmentInserts: any[] = [];
      assignments.forEach(assignment => {
        assignment.members.forEach(memberName => {
          if (memberNameToId[memberName]) {
            assignmentInserts.push({
              roster_id: roster.id,
              member_id: memberNameToId[memberName],
              assignment_date: assignment.date
            });
          }
        });
      });

      const { error: assignmentsError } = await supabase
        .from('cleaning_assignments')
        .insert(assignmentInserts);

      if (assignmentsError) throw assignmentsError;

      toast({
        title: "Roster Saved",
        description: `Successfully saved "${rosterName}" with ${assignments.length} weeks of cleaning assignments`
      });

      // Reset form
      setRosterName("");
      setStartDate(undefined);
      setEndDate(undefined);
      setMembers([]);
      setAssignments([]);

    } catch (error) {
      console.error('Error saving roster:', error);
      toast({
        title: "Error",
        description: "Failed to save roster. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const weeksNeeded = calculateWeeksNeeded();
  const selectedWeeks = calculateSelectedWeeks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            House Cleaning Roster
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Create fair and balanced cleaning schedules for your household members
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Section */}
          <Card className="shadow-lg border-0 bg-card/50 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-primary" />
                Setup Roster
              </CardTitle>
              <CardDescription className="text-base">
                Configure your cleaning schedule parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Roster Name */}
              <div className="space-y-2">
                <Label htmlFor="roster-name" className="text-sm font-medium">Roster Name</Label>
                <Input
                  id="roster-name"
                  placeholder="e.g., January Cleaning Schedule"
                  value={rosterName}
                  onChange={(e) => setRosterName(e.target.value)}
                  className="h-11"
                />
              </div>

              {/* Members first */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Team Members</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter member name"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addMember()}
                    className="h-11"
                  />
                  <Button onClick={addMember} size="icon" className="h-11 w-11 shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                {members.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-3">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="relative rounded-2xl p-4 bg-gradient-to-br from-white/60 to-white/20 dark:from-white/[0.06] dark:to-white/[0.03] backdrop-blur supports-[backdrop-filter]:bg-background/40 ring-1 ring-border shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-10 w-10 ring-2 ring-offset-2 ring-offset-background" style={{ boxShadow: `0 0 0 3px ${member.color}22` }}>
                              <AvatarImage alt={member.name} src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(member.name)}`} />
                              <AvatarFallback>{member.name.slice(0,2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold truncate">{member.name}</span>
                              <span className="inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-offset-2 ring-offset-background" style={{ backgroundColor: member.color }} />
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">Member</div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeMember(member.id)}
                          className="absolute top-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors"
                          aria-label={`Remove ${member.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Suggested Schedule (Modern grid) */}
              {members.length >= 2 && (
                <Card className="bg-muted/30 border-muted">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Suggested Schedule</CardTitle>
                    <CardDescription>
                      {previewWeeks.length > 0
                        ? `${previewWeeks.length} week(s) suggested based on ${members.length} members`
                        : `Add more members to suggest at least 1 week`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {previewWeeks.length > 0 ? (
                      <div className="space-y-3">
                        {previewWeeks.map((ids, idx) => (
                          <div key={idx} className="rounded-xl border bg-background/60 group">
                            <div className="flex items-center justify-between px-4 py-2 border-b">
                              <div className="text-sm font-semibold tracking-wide text-muted-foreground">Week {idx + 1}</div>
                              <div className="text-xs text-muted-foreground">2 members</div>
                            </div>
                            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-3 p-4 auto-rows-min">
                              {ids.map((id) => (
                                <div
                                  key={id}
                                  className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-border hover:shadow-md transition-all duration-200 w-full"
                                  style={{ backgroundColor: memberIdToColor[id] }}
                                >
                                  <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-offset-background" style={{ boxShadow: `0 0 0 3px ${memberIdToColor[id]}33` }}>
                                    <AvatarImage alt={memberIdToName[id]} src={avatarUrlForName(memberIdToName[id])} />
                                    <AvatarFallback>{memberIdToName[id].slice(0,2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-sm font-semibold" style={{ color: getTextColorForBg(memberIdToColor[id]) }}>{memberIdToName[id]}</span>
                                      <span className="inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-offset-2 ring-offset-background" style={{ backgroundColor: getTextColorForBg(memberIdToColor[id]) === 'white' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)' }} />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Not enough members to suggest multiple weeks without consecutive assignments.</div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Date Range */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Date Range</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal h-11",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP") : "Pick start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal h-11",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP") : "Pick end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Week Calculation Display */}
              {(startDate && endDate) && (
                <Card className="bg-accent/50 border-accent">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-accent-foreground" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          Selected Period: {selectedWeeks} weeks
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cleaning assignments will be scheduled for every Sunday
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Members - duplicate input removed */}

              {/* Info Panel */}
              {members.length >= 2 && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-medium">
                          {members.length} members added
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>
                          Minimum {weeksNeeded} weeks needed for fair distribution
                        </span>
                      </div>
                      {selectedWeeks > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-blue-600" />
                          <span>
                            {selectedWeeks >= 1
                              ? `You'll generate ${selectedWeeks} weekly assignments (2 members each).`
                              : `Pick a date range to generate assignments.`}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="space-y-3 pt-2">
                <Button 
                  onClick={generateSchedule} 
                  className="w-full h-11 text-base"
                  disabled={!startDate || !endDate || members.length < 2}
                >
                  Generate Schedule
                </Button>
                {assignments.length > 0 && (
                  <Button 
                    onClick={saveRoster} 
                    variant="secondary" 
                    className="w-full h-11 text-base"
                    disabled={isLoading}
                  >
                    {isLoading ? "Saving..." : "Save Roster"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results Section */}
          <Card className="shadow-lg border-0 bg-card/50 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-primary" />
                Generated Schedule
              </CardTitle>
              <CardDescription className="text-base">
                {assignments.length > 0 
                  ? `${assignments.length} weeks of cleaning assignments`
                  : "Schedule will appear here after generation"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignments.length > 0 ? (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {/* Summary counts */}
                  <div className="p-3 rounded-md border bg-muted/30">
                    <div className="text-sm font-medium mb-2">Assigned Counts</div>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const counts: { [name: string]: number } = {};
                        assignments.forEach(a => a.members.forEach(n => counts[n] = (counts[n] || 0) + 1));
                        const entries = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
                        return entries.length > 0
                          ? entries.map(([name, count]) => (
                              <Badge key={name} variant="outline" className="text-sm">{name}: {count}</Badge>
                            ))
                          : (<span className="text-xs text-muted-foreground">No assignments yet</span>);
                      })()}
                    </div>
                  </div>
                  {/* Legend */}
                  {members.length > 0 && (
                    <div className="rounded-md border bg-background/60 p-3">
                      <div className="text-sm font-medium mb-2">Legend</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {members.map((m) => (
                          <div
                            key={m.id}
                            className="relative overflow-hidden rounded-md ring-1 ring-border hover:shadow-sm transition-all duration-200"
                            style={{ backgroundColor: m.color }}
                            title={m.name}
                          >
                            <div
                              className="flex items-center justify-center h-9 text-xs font-semibold"
                              style={{ color: getTextColorForBg(m.color) }}
                            >
                              <span className="truncate px-2 w-full text-center">{m.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Table view (modern, readable) */}
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Week</TableHead>
                        <TableHead>Members</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((assignment, index) => (
                        <TableRow key={index}>
                          <TableCell className="whitespace-nowrap">{format(new Date(assignment.date), "EEE, MMM d, yyyy")}</TableCell>
                          <TableCell>Week {index + 1}</TableCell>
                          <TableCell>
                            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] gap-2 auto-rows-min">
                              {assignment.members.map((member, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-md p-2 ring-1 ring-border hover:shadow-sm transition-all duration-200 w-full" style={{ backgroundColor: memberNameToColor[member] }}>
                                  <Avatar className="h-7 w-7 ring-2 ring-offset-2 ring-offset-background" style={{ boxShadow: `0 0 0 3px ${memberNameToColor[member]}33` }}>
                                    <AvatarImage alt={member} src={avatarUrlForName(member)} />
                                    <AvatarFallback>{member.slice(0,2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <span className="truncate text-sm font-semibold block" style={{ color: getTextColorForBg(memberNameToColor[member]) }}>{member}</span>
                                  <span className="inline-flex h-2 w-2 rounded-full ring-2 ring-offset-2 ring-offset-background" style={{ backgroundColor: getTextColorForBg(memberNameToColor[member]) === 'white' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)' }} />
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableCaption>{assignments.length} total week(s)</TableCaption>
                  </Table>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  <CalendarDays className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">No schedule generated yet</p>
                  <p className="text-sm">Add members and select dates to generate assignments</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};