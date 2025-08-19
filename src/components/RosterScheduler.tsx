import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Users, Calendar as CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Member {
  id: string;
  name: string;
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
  
  const { toast } = useToast();

  const addMember = () => {
    if (newMemberName.trim()) {
      const newMember: Member = {
        id: crypto.randomUUID(),
        name: newMemberName.trim()
      };
      setMembers([...members, newMember]);
      setNewMemberName("");
    }
  };

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

    // Calculate fair distribution
    const totalWeeks = sundays.length;
    const membersPerWeek = 2;
    const totalAssignments = totalWeeks * membersPerWeek;
    const assignmentsPerMember = Math.floor(totalAssignments / members.length);
    const extraAssignments = totalAssignments % members.length;

    // Track member assignments and last assigned week
    const memberCounts: { [key: string]: number } = {};
    const lastAssigned: { [key: string]: number } = {};
    
    members.forEach(member => {
      memberCounts[member.id] = 0;
      lastAssigned[member.id] = -2; // Allow assignment on first week
    });

    const newAssignments: Assignment[] = [];

    for (let weekIndex = 0; weekIndex < sundays.length; weekIndex++) {
      const weekAssignments: string[] = [];
      
      // Get available members (not assigned last week and haven't reached quota)
      let availableMembers = members.filter(member => {
        const notConsecutive = lastAssigned[member.id] < weekIndex - 1;
        const belowQuota = memberCounts[member.id] < assignmentsPerMember || 
          (memberCounts[member.id] === assignmentsPerMember && 
           Object.values(memberCounts).filter(count => count === assignmentsPerMember).length < members.length - extraAssignments);
        return notConsecutive && belowQuota;
      });

      // If not enough available members, allow consecutive assignments
      if (availableMembers.length < 2) {
        availableMembers = members.filter(member => {
          const belowQuota = memberCounts[member.id] < assignmentsPerMember || 
            (memberCounts[member.id] === assignmentsPerMember && 
             Object.values(memberCounts).filter(count => count === assignmentsPerMember).length < members.length - extraAssignments);
          return belowQuota;
        });
      }

      // Select 2 members with lowest assignment counts
      availableMembers.sort((a, b) => {
        const countDiff = memberCounts[a.id] - memberCounts[b.id];
        if (countDiff !== 0) return countDiff;
        return lastAssigned[a.id] - lastAssigned[b.id]; // Prefer less recently assigned
      });

      for (let i = 0; i < Math.min(2, availableMembers.length); i++) {
        const member = availableMembers[i];
        weekAssignments.push(member.name);
        memberCounts[member.id]++;
        lastAssigned[member.id] = weekIndex;
      }

      newAssignments.push({
        date: format(sundays[weekIndex], "yyyy-MM-dd"),
        members: weekAssignments
      });
    }

    setAssignments(newAssignments);
    
    toast({
      title: "Schedule Generated",
      description: `Generated cleaning schedule for ${sundays.length} weeks`
    });
  };

  const calculateWeeksNeeded = () => {
    if (members.length < 2) return 0;
    // Each week needs 2 members, so minimum weeks needed for fair distribution
    return Math.ceil((members.length * 2) / 2); // Each member should get at least 2 assignments
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">House Cleaning Roster</h1>
        <p className="text-muted-foreground">Create fair cleaning schedules for your household</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Setup Roster
            </CardTitle>
            <CardDescription>
              Configure your cleaning schedule parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Roster Name */}
            <div className="space-y-2">
              <Label htmlFor="roster-name">Roster Name</Label>
              <Input
                id="roster-name"
                placeholder="e.g., January Cleaning Schedule"
                value={rosterName}
                onChange={(e) => setRosterName(e.target.value)}
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
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
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
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

            {/* Members */}
            <div className="space-y-2">
              <Label>Members</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter member name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addMember()}
                />
                <Button onClick={addMember} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-2">
                {members.map((member) => (
                  <Badge key={member.id} variant="secondary" className="flex items-center gap-2">
                    {member.name}
                    <button onClick={() => removeMember(member.id)}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Info Panel */}
            {members.length >= 2 && (
              <Card className="bg-muted">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4" />
                    <span>
                      {members.length} members • Minimum {weeksNeeded} weeks needed for fair distribution
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button onClick={generateSchedule} className="w-full">
                Generate Schedule
              </Button>
              {assignments.length > 0 && (
                <Button 
                  onClick={saveRoster} 
                  variant="secondary" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Saving..." : "Save Roster"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Generated Schedule
            </CardTitle>
            <CardDescription>
              {assignments.length > 0 
                ? `${assignments.length} weeks of cleaning assignments`
                : "Schedule will appear here after generation"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assignments.length > 0 ? (
              <div className="space-y-3">
                {assignments.map((assignment, index) => (
                  <div key={index} className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">
                        {format(new Date(assignment.date), "EEEE, MMMM d, yyyy")}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Week {index + 1}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {assignment.members.map((member, memberIndex) => (
                        <Badge key={memberIndex} variant="default">
                          {member}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Generate a schedule to see assignments here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};