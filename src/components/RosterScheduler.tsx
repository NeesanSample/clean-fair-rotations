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
import { CalendarIcon, Plus, Trash2, Users, Calendar as CalendarDays, Clock, CheckCircle, AlertCircle, Sparkles } from "lucide-react";
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
    const colors = [
      'hsl(250 84% 54%)', // Primary
      'hsl(25 95% 53%)',  // Accent
      'hsl(142 76% 36%)', // Success
      'hsl(280 84% 64%)', // Purple variant
      'hsl(45 95% 58%)',  // Warning
      'hsl(200 84% 54%)', // Blue
      'hsl(320 84% 54%)', // Pink
      'hsl(160 84% 44%)', // Teal
    ];
    return colors[index % colors.length];
  };

  const getTextColorForBg = (hslColor: string): string => {
    return 'white'; // Always use white text for modern contrast
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
      
      toast({
        title: "Member Added",
        description: `${newMember.name} has been added to the team`,
      });
    }
  };

  const calculateWeeksNeeded = () => {
    const m = members.length;
    if (m < 2) return 0;
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
    setAssignments([]);
  }, [members]);

  const removeMember = (id: string) => {
    const memberToRemove = members.find(m => m.id === id);
    setMembers(members.filter(member => member.id !== id));
    
    if (memberToRemove) {
      toast({
        title: "Member Removed",
        description: `${memberToRemove.name} has been removed from the team`,
        variant: "destructive"
      });
    }
  };

  const getSundays = (start: Date, end: Date): Date[] => {
    const sundays: Date[] = [];
    const current = new Date(start);
    
    while (current.getDay() !== 0) {
      current.setDate(current.getDate() + 1);
    }
    
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

    const totalWeeks = sundays.length;
    if (totalWeeks > 1 && members.length < 4) {
      toast({
        title: "Not Enough Members",
        description: "For multiple weeks, at least 4 members are required to avoid consecutive assignments.",
        variant: "destructive"
      });
      return;
    }

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
      title: "Schedule Generated! ✨",
      description: `Generated cleaning schedule for ${sundays.length} weeks with fair distribution`,
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

      const memberInserts = members.map(member => ({
        roster_id: roster.id,
        name: member.name
      }));

      const { data: savedMembers, error: membersError } = await supabase
        .from('roster_members')
        .insert(memberInserts)
        .select();

      if (membersError) throw membersError;

      const memberNameToId: { [key: string]: string } = {};
      savedMembers.forEach(member => {
        memberNameToId[member.name] = member.id;
      });

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
        title: "Roster Saved Successfully! 🎉",
        description: `"${rosterName}" saved with ${assignments.length} weeks of assignments`
      });

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
    <div className="min-h-screen relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/3" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-primary opacity-10 rounded-full blur-3xl animate-bounce-subtle" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-accent opacity-10 rounded-full blur-3xl animate-bounce-subtle [animation-delay:1s]" />
      
      <div className="relative z-10 container mx-auto px-6 py-12 space-y-12">
        {/* Header */}
        <div className="text-center space-y-6 animate-fade-in">
          <div className="inline-flex items-center justify-center p-4 glass rounded-3xl hover:shadow-glow transition-all duration-500">
            <Users className="h-12 w-12 text-primary animate-bounce-subtle" />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent leading-tight">
              House Cleaning Roster
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Create fair and balanced cleaning schedules for your household members with intelligent distribution
            </p>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* Setup Section */}
          <div className="space-y-8 animate-slide-up">
            <Card className="card-modern hover:shadow-glow transition-all duration-500">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-4 text-2xl">
                  <div className="p-3 bg-gradient-primary rounded-2xl">
                    <CalendarDays className="h-6 w-6 text-primary-foreground" />
                  </div>
                  Setup Roster
                </CardTitle>
                <CardDescription className="text-lg text-muted-foreground">
                  Configure your cleaning schedule parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Roster Name */}
                <div className="space-y-3">
                  <Label htmlFor="roster-name" className="text-sm font-semibold">Roster Name</Label>
                  <Input
                    id="roster-name"
                    placeholder="e.g., January Cleaning Schedule"
                    value={rosterName}
                    onChange={(e) => setRosterName(e.target.value)}
                    className="h-12 border-2 border-border/50 focus:border-primary focus:ring-primary/20 rounded-xl transition-all duration-300"
                  />
                </div>

                {/* Team Members */}
                <div className="space-y-4">
                  <Label className="text-sm font-semibold">Team Members</Label>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Enter member name"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addMember()}
                      className="h-12 border-2 border-border/50 focus:border-primary focus:ring-primary/20 rounded-xl transition-all duration-300"
                    />
                    <Button 
                      onClick={addMember} 
                      size="lg" 
                      className="h-12 px-6 btn-gradient rounded-xl font-semibold transform active:scale-95"
                      disabled={!newMemberName.trim()}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  
                  {members.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                      {members.map((member, index) => (
                        <div
                          key={member.id}
                          className="group relative card-modern hover:scale-105 transition-all duration-300"
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          <div className="flex items-center gap-4 p-5">
                            <div className="relative">
                              <Avatar className="h-12 w-12 ring-4 ring-offset-2 ring-offset-background border-2 border-background shadow-lg" style={{ borderColor: member.color }}>
                                <AvatarImage src={avatarUrlForName(member.name)} />
                                <AvatarFallback className="font-bold text-sm" style={{ backgroundColor: member.color, color: 'white' }}>
                                  {member.name.slice(0,2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full shadow-lg animate-pulse" style={{ backgroundColor: member.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-foreground block truncate">{member.name}</span>
                              <span className="text-sm text-muted-foreground">Team Member</span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeMember(member.id)}
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Stats */}
                {members.length >= 2 && (
                  <div className="glass p-6 rounded-2xl border-2 border-border/20 animate-fade-in">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-gradient-accent rounded-xl">
                        <Sparkles className="h-5 w-5 text-accent-foreground" />
                      </div>
                      <span className="font-bold text-foreground">Team Analysis</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-secondary/50 rounded-xl">
                        <div className="text-2xl font-bold text-primary">{members.length}</div>
                        <div className="text-sm text-muted-foreground">Members</div>
                      </div>
                      <div className="text-center p-4 bg-secondary/50 rounded-xl">
                        <div className="text-2xl font-bold text-accent">{weeksNeeded}</div>
                        <div className="text-sm text-muted-foreground">Weeks Needed</div>
                      </div>
                    </div>
                    {weeksNeeded > 0 && (
                      <div className="mt-4 p-4 bg-success/10 border-2 border-success/20 rounded-xl">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span className="text-success font-medium text-sm">
                            Minimum {weeksNeeded} weeks recommended for fair distribution
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Schedule Configuration */}
          <div className="space-y-8 animate-slide-up [animation-delay:200ms]">
            <Card className="card-modern hover:shadow-glow transition-all duration-500">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-4 text-2xl">
                  <div className="p-3 bg-gradient-secondary rounded-2xl">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  Date Range
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Date Range */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-12 border-2 border-border/50 hover:border-primary focus:border-primary rounded-xl transition-all duration-300 justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-3 h-5 w-5" />
                          {startDate ? format(startDate, "PPP") : "Pick start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass border-2 border-border/30" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-12 border-2 border-border/50 hover:border-primary focus:border-primary rounded-xl transition-all duration-300 justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-3 h-5 w-5" />
                          {endDate ? format(endDate, "PPP") : "Pick end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass border-2 border-border/30" align="start">
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

                {/* Date Analysis */}
                {startDate && endDate && members.length >= 2 && (
                  <div className="glass p-6 rounded-2xl border-2 border-border/20 animate-fade-in">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Selected weeks:</span>
                        <span className="font-bold text-primary text-xl">{selectedWeeks}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Minimum needed:</span>
                        <span className="font-bold text-accent text-xl">{weeksNeeded}</span>
                      </div>
                      
                      {selectedWeeks < weeksNeeded && (
                        <div className="p-4 bg-warning/10 border-2 border-warning/20 rounded-xl">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-warning shrink-0" />
                            <span className="text-warning font-medium">
                              Consider selecting at least {weeksNeeded} weeks for optimal distribution
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {selectedWeeks >= weeksNeeded && (
                        <div className="p-4 bg-success/10 border-2 border-success/20 rounded-xl">
                          <div className="flex items-center gap-3">
                            <CheckCircle className="h-5 w-5 text-success shrink-0" />
                            <span className="text-success font-medium">
                              Perfect! Your schedule allows for fair distribution
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-4">
                  <Button 
                    onClick={generateSchedule} 
                    disabled={members.length < 2 || !startDate || !endDate}
                    size="lg"
                    className="w-full btn-gradient h-14 rounded-xl font-bold text-lg transform active:scale-95"
                  >
                    <Sparkles className="h-5 w-5 mr-3" />
                    Generate Schedule
                  </Button>

                  {assignments.length > 0 && (
                    <Button 
                      onClick={saveRoster}
                      disabled={isLoading || !rosterName.trim()}
                      size="lg"
                      variant="outline"
                      className="w-full h-12 rounded-xl font-semibold border-2 border-primary/30 hover:bg-primary hover:text-primary-foreground"
                    >
                      {isLoading ? "Saving..." : "Save Roster"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Generated Schedule */}
        {assignments.length > 0 && (
          <Card className="card-modern animate-fade-in mt-12">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-4 text-2xl">
                <div className="p-3 bg-gradient-primary rounded-2xl">
                  <CheckCircle className="h-6 w-6 text-primary-foreground" />
                </div>
                Generated Schedule
                <Badge className="ml-auto bg-gradient-accent text-accent-foreground font-bold px-4 py-2 rounded-xl">
                  {assignments.length} weeks
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-2xl border-2 border-border/30">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-secondary border-b-2 border-border/30 hover:bg-gradient-secondary">
                      <TableHead className="font-bold text-foreground text-lg p-6">Date</TableHead>
                      <TableHead className="font-bold text-foreground text-lg p-6">Assigned Members</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment, index) => (
                      <TableRow 
                        key={index} 
                        className="border-b border-border/20 hover:bg-secondary/30 transition-all duration-300"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <TableCell className="p-6 font-semibold text-lg">
                          {format(new Date(assignment.date), "EEEE, MMMM do, yyyy")}
                        </TableCell>
                        <TableCell className="p-6">
                          <div className="flex gap-3">
                            {assignment.members.map((memberName, memberIndex) => (
                              <div
                                key={memberIndex}
                                className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl font-bold shadow-lg hover:shadow-glow transition-all duration-300"
                                style={{ backgroundColor: memberNameToColor[memberName] || 'hsl(var(--primary))' }}
                              >
                                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                                <span className="text-white">{memberName}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};