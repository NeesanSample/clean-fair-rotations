import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Users, Calendar as CalendarDays, Clock, CheckCircle, AlertCircle, Sparkles, Loader2, RefreshCw, Trash, CheckSquare, Square, ArrowRightLeft, MoreHorizontal, Download, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface Member {
  id: string;
  name: string;
  color: string;
}

interface Assignment {
  date: string;
  members: string[];
  assignments?: Array<{
    id: string;
    memberId: string;
    memberName: string;
    isCompleted: boolean;
    completedAt?: string;
    completedBy?: string;
    swappedWith?: string;
    swapRequestedAt?: string;
    swapRequestedBy?: string;
    swapStatus?: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  }>;
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
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const [rosters, setRosters] = useState<any[]>([]);
  const [selectedRosterId, setSelectedRosterId] = useState<string>("");
  const [isLoadingRosters, setIsLoadingRosters] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedAssignmentForSwap, setSelectedAssignmentForSwap] = useState<{
    assignmentId: string;
    memberId: string;
    memberName: string;
    date: string;
  } | null>(null);
  const [swapTargetDate, setSwapTargetDate] = useState<string>("");
  const [swapTargetMember, setSwapTargetMember] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  
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

  // Load saved rosters
  const loadRosters = async () => {
    try {
      const { data, error } = await supabase
        .from('rosters')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRosters(data || []);
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to load rosters', variant: 'destructive' });
    }
  };

  useEffect(() => {
    loadRosters();
  }, []);

  const handleSelectRoster = async (rosterId: string) => {
    try {
      setIsHydrating(true);
      setSelectedRosterId(rosterId);
      const { data: roster, error: rosterError } = await supabase
        .from('rosters')
        .select('*')
        .eq('id', rosterId)
        .single();
      if (rosterError) throw rosterError;

      const { data: dbMembers, error: membersError } = await supabase
        .from('roster_members')
        .select('*')
        .eq('roster_id', rosterId);
      if (membersError) throw membersError;

      const { data: dbAssignments, error: assignError } = await supabase
        .from('cleaning_assignments')
        .select('*')
        .eq('roster_id', rosterId)
        .order('assignment_date', { ascending: true });
      if (assignError) throw assignError;

      setRosterName(roster?.name || '');
      setStartDate(roster?.start_date ? new Date(roster.start_date) : undefined);
      setEndDate(roster?.end_date ? new Date(roster.end_date) : undefined);

      const loadedMembers: Member[] = (dbMembers || []).map((m: any, idx: number) => ({
        id: m.id,
        name: m.name,
        color: generateColorForIndex(idx)
      }));
      setMembers(loadedMembers);

      // Group assignments by date with detailed information
      const grouped: Record<string, any[]> = {};
      (dbAssignments || []).forEach((a: any) => {
        const key = a.assignment_date;
        if (!grouped[key]) grouped[key] = [];
        const mem = (dbMembers || []).find((m: any) => m.id === a.member_id);
        if (mem) {
          grouped[key].push({
            id: a.id,
            memberId: a.member_id,
            memberName: mem.name,
            isCompleted: a.is_completed,
            completedAt: a.completed_at,
            completedBy: a.completed_by,
            swappedWith: a.swapped_with,
            swapRequestedAt: a.swap_requested_at,
            swapRequestedBy: a.swap_requested_by,
            swapStatus: a.swap_status
          });
        }
      });
      
      const builtAssignments = Object.keys(grouped).sort().map(date => ({ 
        date, 
        members: grouped[date].map(a => a.memberName),
        assignments: grouped[date]
      }));
      setAssignments(builtAssignments);
      toast({ title: 'Roster Loaded', description: `Loaded "${roster?.name}"` });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to load roster', variant: 'destructive' });
    } finally {
      setIsHydrating(false);
    }
  };

  const handleDeleteRoster = async (rosterId: string) => {
    try {
      const { error: da } = await supabase.from('cleaning_assignments').delete().eq('roster_id', rosterId);
      if (da) throw da;
      const { error: dm } = await supabase.from('roster_members').delete().eq('roster_id', rosterId);
      if (dm) throw dm;
      const { error: dr } = await supabase.from('rosters').delete().eq('id', rosterId);
      if (dr) throw dr;
      toast({ title: 'Deleted', description: 'Roster deleted successfully' });
      if (selectedRosterId === rosterId) {
        setSelectedRosterId("");
        setRosterName("");
        setStartDate(undefined);
        setEndDate(undefined);
        setMembers([]);
        setAssignments([]);
      }
      loadRosters();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete roster', variant: 'destructive' });
    }
  };

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

  const assignedCounts = useMemo(() => {
    const map: { [name: string]: number } = {};
    assignments.forEach(a => a.members.forEach(n => {
      map[n] = (map[n] || 0) + 1;
    }));
    return map;
  }, [assignments]);

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
    // Do not clear assignments on member changes; preserve loaded schedules
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
        members: chosen.map(c => c.name),
        assignments: chosen.map(c => ({
          id: '', // Will be set when saved to DB
          memberId: c.id,
          memberName: c.name,
          isCompleted: false
        }))
      });
    }

    setAssignments(newAssignments);
    // Auto-persist the schedule so it shows after reload/load
    if (rosterName.trim()) {
      persistRoster(rosterName.trim(), startDate, endDate, members, newAssignments)
        .then(() => loadRosters())
        .catch(() => {
          // Non-blocking error toast
          toast({ title: 'Warning', description: 'Generated schedule, but failed to persist automatically.', variant: 'destructive' });
        });
    }
    
    toast({
      title: "Schedule Generated! ✨",
      description: `Generated cleaning schedule for ${sundays.length} weeks with fair distribution`,
    });
  };

  const calculateSelectedWeeks = () => {
    if (!startDate || !endDate) return 0;
    return getSundays(startDate, endDate).length;
  };

  // Persist roster by name (override if exists)
  const persistRoster = async (
    name: string,
    start: Date,
    end: Date,
    currentMembers: Member[],
    currentAssignments: Assignment[]
  ) => {
    const startStr = format(start, "yyyy-MM-dd");
    const endStr = format(end, "yyyy-MM-dd");

    const { data: existing, error: findError } = await supabase
      .from('rosters')
      .select('*')
      .eq('name', name)
      .limit(1);
    if (findError) throw findError;

    let rosterId: string;
    const isUpdate = Array.isArray(existing) && existing.length > 0;

    if (isUpdate) {
      rosterId = (existing as any[])[0].id;
      const { error: updateError } = await supabase
        .from('rosters')
        .update({ start_date: startStr, end_date: endStr })
        .eq('id', rosterId);
      if (updateError) throw updateError;
      const { error: delAssign } = await supabase
        .from('cleaning_assignments')
        .delete()
        .eq('roster_id', rosterId);
      if (delAssign) throw delAssign;
      const { error: delMembers } = await supabase
        .from('roster_members')
        .delete()
        .eq('roster_id', rosterId);
      if (delMembers) throw delMembers;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('rosters')
        .insert({ name, start_date: startStr, end_date: endStr })
        .select()
        .single();
      if (insertError) throw insertError;
      rosterId = (inserted as any).id;
    }

    const memberInserts = currentMembers.map(m => ({ roster_id: rosterId, name: m.name }));
    const { data: savedMembers, error: membersError } = await supabase
      .from('roster_members')
      .insert(memberInserts)
      .select();
    if (membersError) throw membersError;

    const memberNameToId: { [key: string]: string } = {};
    (savedMembers as any[]).forEach(member => {
      memberNameToId[member.name] = member.id;
    });

    const assignmentInserts: any[] = [];
    currentAssignments.forEach(a => {
      if (a.assignments) {
        // Use detailed assignment data if available
        a.assignments.forEach(assignment => {
          const memberId = memberNameToId[assignment.memberName];
          if (memberId) {
            assignmentInserts.push({ 
              roster_id: rosterId, 
              member_id: memberId, 
              assignment_date: a.date,
              is_completed: assignment.isCompleted || false,
              completed_at: assignment.completedAt || null,
              completed_by: assignment.completedBy || null,
              swapped_with: assignment.swappedWith || null,
              swap_requested_at: assignment.swapRequestedAt || null,
              swap_requested_by: assignment.swapRequestedBy || null,
              swap_status: assignment.swapStatus || null
            });
          }
        });
      } else {
        // Fallback to simple member names
        a.members.forEach(memberName => {
          const memberId = memberNameToId[memberName];
          if (memberId) {
            assignmentInserts.push({ roster_id: rosterId, member_id: memberId, assignment_date: a.date });
          }
        });
      }
    });
    if (assignmentInserts.length > 0) {
      const { error: aErr } = await supabase
        .from('cleaning_assignments')
        .insert(assignmentInserts);
      if (aErr) throw aErr;
    }

    return { rosterId, isUpdate };
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
      const name = rosterName.trim();
      const { isUpdate } = await persistRoster(name, startDate, endDate, members, assignments);
      loadRosters();
      toast({
        title: isUpdate ? "Roster Updated" : "Roster Saved Successfully! 🎉",
        description: `${isUpdate ? 'Updated' : 'Saved'} "${rosterName}" with ${assignments.length} weeks`
      });

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

  // Task completion and swapping functions
  const markTaskCompleted = async (assignmentId: string, memberId: string) => {
    try {
      const { error } = await supabase
        .from('cleaning_assignments')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          completed_by: memberId
        })
        .eq('id', assignmentId);
      
      if (error) throw error;
      
      // Refresh assignments to show updated status
      if (selectedRosterId) {
        await handleSelectRoster(selectedRosterId);
      }
      
      toast({
        title: "Task Completed! ✅",
        description: "Cleaning task has been marked as completed",
      });
    } catch (error) {
      console.error('Error marking task completed:', error);
      toast({
        title: "Error",
        description: "Failed to mark task as completed",
        variant: "destructive"
      });
    }
  };

  const markTaskIncomplete = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('cleaning_assignments')
        .update({
          is_completed: false,
          completed_at: null,
          completed_by: null
        })
        .eq('id', assignmentId);
      
      if (error) throw error;
      
      // Refresh assignments to show updated status
      if (selectedRosterId) {
        await handleSelectRoster(selectedRosterId);
      }
      
      toast({
        title: "Task Reopened",
        description: "Cleaning task has been marked as incomplete",
      });
    } catch (error) {
      console.error('Error marking task incomplete:', error);
      toast({
        title: "Error",
        description: "Failed to reopen task",
        variant: "destructive"
      });
    }
  };

  const requestTaskSwap = async (assignmentId: string, requestingMemberId: string, targetMemberId: string) => {
    try {
      const { error } = await supabase
        .from('cleaning_assignments')
        .update({
          swap_requested_at: new Date().toISOString(),
          swap_requested_by: requestingMemberId,
          swapped_with: targetMemberId,
          swap_status: 'pending'
        })
        .eq('id', assignmentId);
      
      if (error) throw error;
      
      // Refresh assignments to show updated status
      if (selectedRosterId) {
        await handleSelectRoster(selectedRosterId);
      }
      
      toast({
        title: "Swap Requested",
        description: "Task swap request has been sent",
      });
    } catch (error) {
      console.error('Error requesting task swap:', error);
      toast({
        title: "Error",
        description: "Failed to request task swap",
        variant: "destructive"
      });
    }
  };

  const respondToSwapRequest = async (assignmentId: string, response: 'accepted' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('cleaning_assignments')
        .update({
          swap_status: response
        })
        .eq('id', assignmentId);
      
      if (error) throw error;
      
      // If accepted, swap the assignments
      if (response === 'accepted') {
        // This would require additional logic to actually swap the assignments
        // For now, we'll just update the status
        toast({
          title: "Swap Accepted",
          description: "Task swap has been accepted",
        });
      } else {
        toast({
          title: "Swap Rejected",
          description: "Task swap has been rejected",
        });
      }
      
      // Refresh assignments to show updated status
      if (selectedRosterId) {
        await handleSelectRoster(selectedRosterId);
      }
    } catch (error) {
      console.error('Error responding to swap request:', error);
      toast({
        title: "Error",
        description: "Failed to respond to swap request",
        variant: "destructive"
      });
    }
  };

  const openSwapDialog = (assignmentId: string, memberId: string, memberName: string, date: string) => {
    setSelectedAssignmentForSwap({
      assignmentId,
      memberId,
      memberName,
      date
    });
    setSwapDialogOpen(true);
  };

  const executeSwap = async () => {
    if (!selectedAssignmentForSwap || !swapTargetDate || !swapTargetMember) return;

    try {
      // Check if we have valid assignment IDs (not empty strings)
      if (!selectedAssignmentForSwap.assignmentId || selectedAssignmentForSwap.assignmentId === '') {
        toast({
          title: "Error",
          description: "Cannot swap unsaved assignments. Please save the roster first.",
          variant: "destructive"
        });
        return;
      }

      // Find the target member's assignment for the target date
      const targetAssignment = assignments
        .find(a => a.date === swapTargetDate)
        ?.assignments?.find(ta => ta.memberName === swapTargetMember);

      if (!targetAssignment) {
        toast({
          title: "Error",
          description: "Target member is not assigned to the selected date",
          variant: "destructive"
        });
        return;
      }

      // Check if the target assignment has a valid ID
      if (!targetAssignment.id || targetAssignment.id === '') {
        toast({
          title: "Error",
          description: "Cannot swap with unsaved assignment. Please save the roster first.",
          variant: "destructive"
        });
        return;
      }

      // Check if the target assignment is completed
      if (targetAssignment.isCompleted) {
        toast({
          title: "Error",
          description: "Cannot swap with a completed task",
          variant: "destructive"
        });
        return;
      }

      // Update both assignments to swap them
      const swapTimestamp = new Date().toISOString();
      const { error: error1 } = await supabase
        .from('cleaning_assignments')
        .update({
          member_id: targetAssignment.memberId,
          assignment_date: selectedAssignmentForSwap.date,
          swapped_with: targetAssignment.id,
          swap_status: 'accepted',
          swap_requested_at: swapTimestamp
        })
        .eq('id', selectedAssignmentForSwap.assignmentId);

      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from('cleaning_assignments')
        .update({
          member_id: selectedAssignmentForSwap.memberId,
          assignment_date: swapTargetDate,
          swapped_with: selectedAssignmentForSwap.assignmentId,
          swap_status: 'accepted',
          swap_requested_at: swapTimestamp
        })
        .eq('id', targetAssignment.id);

      if (error2) throw error2;

             // Refresh assignments to show updated status
       if (selectedRosterId) {
         await handleSelectRoster(selectedRosterId);
         // Also refresh the rosters list to ensure consistency
         await loadRosters();
       } else {
         // If no roster is selected, we need to refresh the assignments from the database
         // This handles the case where assignments were swapped but not saved yet
         try {
           const { data: dbAssignments, error: assignError } = await supabase
             .from('cleaning_assignments')
             .select('*')
             .order('assignment_date', { ascending: true });
           
           if (!assignError && dbAssignments) {
             // Group assignments by date with detailed information
             const grouped: Record<string, any[]> = {};
             dbAssignments.forEach((a: any) => {
               const key = a.assignment_date;
               if (!grouped[key]) grouped[key] = [];
               const mem = members.find((m: any) => m.id === a.member_id);
               if (mem) {
                 grouped[key].push({
                   id: a.id,
                   memberId: a.member_id,
                   memberName: mem.name,
                   isCompleted: a.is_completed,
                   completedAt: a.completed_at,
                   completedBy: a.completed_by,
                   swappedWith: a.swapped_with,
                   swapRequestedAt: a.swap_requested_at,
                   swapRequestedBy: a.swap_requested_by,
                   swapStatus: a.swap_status
                 });
               }
             });
             
             const builtAssignments = Object.keys(grouped).sort().map(date => ({ 
               date, 
               members: grouped[date].map(a => a.memberName),
               assignments: grouped[date]
             }));
             setAssignments(builtAssignments);
           }
         } catch (refreshError) {
           console.error('Error refreshing assignments after swap:', refreshError);
         }
       }

       setSwapDialogOpen(false);
       setSelectedAssignmentForSwap(null);
       setSwapTargetDate("");
       setSwapTargetMember("");

       toast({
         title: "Swap Completed! 🔄",
         description: `${selectedAssignmentForSwap.memberName} and ${swapTargetMember} have swapped tasks`,
       });
    } catch (error) {
      console.error('Error executing swap:', error);
              toast({
          title: "Error",
          description: "Failed to execute task swap",
          variant: "destructive"
        });
      }
    };

    // Export functions
    const exportAsImage = async () => {
      if (assignments.length === 0) {
        toast({
          title: "No Schedule to Export",
          description: "Please generate a schedule first",
          variant: "destructive"
        });
        return;
      }

      setIsExporting(true);
      try {
        // Create a temporary container for export
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0';
        tempContainer.style.width = '800px';
        tempContainer.style.backgroundColor = '#ffffff';
        tempContainer.style.padding = '20px';
        tempContainer.style.fontFamily = 'Arial, sans-serif';
        tempContainer.style.color = '#000000';
        
        // Add title
        const title = document.createElement('h1');
        title.textContent = 'House Cleaning Schedule';
        title.style.fontSize = '24px';
        title.style.fontWeight = 'bold';
        title.style.textAlign = 'center';
        title.style.marginBottom = '20px';
        title.style.color = '#000000';
        tempContainer.appendChild(title);

        // Add roster info
        if (rosterName) {
          const rosterInfo = document.createElement('p');
          rosterInfo.textContent = `Roster: ${rosterName}`;
          rosterInfo.style.fontSize = '16px';
          rosterInfo.style.textAlign = 'center';
          rosterInfo.style.marginBottom = '10px';
          rosterInfo.style.color = '#666666';
          tempContainer.appendChild(rosterInfo);
        }

        // Add date range
        if (startDate && endDate) {
          const dateInfo = document.createElement('p');
          dateInfo.textContent = `Period: ${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
          dateInfo.style.fontSize = '14px';
          dateInfo.style.textAlign = 'center';
          dateInfo.style.marginBottom = '20px';
          dateInfo.style.color = '#666666';
          tempContainer.appendChild(dateInfo);
        }

        // Add member counts
        const countsTitle = document.createElement('h2');
        countsTitle.textContent = 'Assignment Counts';
        countsTitle.style.fontSize = '18px';
        countsTitle.style.fontWeight = 'bold';
        countsTitle.style.marginBottom = '10px';
        countsTitle.style.color = '#000000';
        tempContainer.appendChild(countsTitle);

        const countsContainer = document.createElement('div');
        countsContainer.style.display = 'grid';
        countsContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
        countsContainer.style.gap = '10px';
        countsContainer.style.marginBottom = '20px';

        Object.entries(assignedCounts).forEach(([name, count]) => {
          const countItem = document.createElement('div');
          countItem.style.padding = '10px';
          countItem.style.border = '1px solid #ddd';
          countItem.style.borderRadius = '5px';
          countItem.style.backgroundColor = '#f9f9f9';
          countItem.innerHTML = `<strong>${name}</strong>: ${count} assignment${count === 1 ? '' : 's'}`;
          countsContainer.appendChild(countItem);
        });
        tempContainer.appendChild(countsContainer);

        // Add schedule table
        const scheduleTitle = document.createElement('h2');
        scheduleTitle.textContent = 'Weekly Schedule';
        scheduleTitle.style.fontSize = '18px';
        scheduleTitle.style.fontWeight = 'bold';
        scheduleTitle.style.marginBottom = '10px';
        scheduleTitle.style.color = '#000000';
        tempContainer.appendChild(scheduleTitle);

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginBottom = '20px';

        // Table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.backgroundColor = '#e3f2fd'; // Light blue background for header row
        
        const dateHeader = document.createElement('th');
        dateHeader.textContent = 'Date';
        dateHeader.style.padding = '12px';
        dateHeader.style.border = '1px solid #2196f3'; // Blue border for header
        dateHeader.style.textAlign = 'left';
        dateHeader.style.fontWeight = 'bold';
        dateHeader.style.color = '#1565c0'; // Darker blue text for contrast
        
        const membersHeader = document.createElement('th');
        membersHeader.textContent = 'Assigned Members';
        membersHeader.style.padding = '12px';
        membersHeader.style.border = '1px solid #2196f3'; // Blue border for header
        membersHeader.style.textAlign = 'left';
        membersHeader.style.fontWeight = 'bold';
        membersHeader.style.color = '#1565c0'; // Darker blue text for contrast
        
        const statusHeader = document.createElement('th');
        statusHeader.textContent = 'Status';
        statusHeader.style.padding = '12px';
        statusHeader.style.border = '1px solid #2196f3'; // Blue border for header
        statusHeader.style.textAlign = 'left';
        statusHeader.style.fontWeight = 'bold';
        statusHeader.style.color = '#1565c0'; // Darker blue text for contrast

        headerRow.appendChild(dateHeader);
        headerRow.appendChild(membersHeader);
        headerRow.appendChild(statusHeader);
        thead.appendChild(headerRow);
        table.appendChild(thead);

                 // Table body
         const tbody = document.createElement('tbody');
         assignments.forEach((assignment, index) => {
           const row = document.createElement('tr');
           
           // Add attractive alternating row colors for better readability
           const isEvenRow = index % 2 === 0;
           if (isEvenRow) {
             row.style.backgroundColor = '#f0f8ff'; // Light blue tint
           } else {
             row.style.backgroundColor = '#fafafa'; // Light gray
           }
          
          const dateCell = document.createElement('td');
          dateCell.textContent = format(new Date(assignment.date), "EEEE, MMMM do, yyyy");
          dateCell.style.padding = '12px';
          dateCell.style.border = '1px solid #ddd';
          
          const membersCell = document.createElement('td');
          if (assignment.assignments) {
            const memberNames = assignment.assignments.map(a => a.memberName).join(', ');
            membersCell.textContent = memberNames;
          } else {
            membersCell.textContent = assignment.members.join(', ');
          }
          membersCell.style.padding = '12px';
          membersCell.style.border = '1px solid #ddd';
          
          const statusCell = document.createElement('td');
          if (assignment.assignments) {
            const completedCount = assignment.assignments.filter(a => a.isCompleted).length;
            const totalCount = assignment.assignments.length;
            statusCell.textContent = `${completedCount}/${totalCount} completed`;
            statusCell.style.color = completedCount === totalCount ? '#22c55e' : '#f59e0b';
          } else {
            statusCell.textContent = 'Not started';
            statusCell.style.color = '#6b7280';
          }
          statusCell.style.padding = '12px';
          statusCell.style.border = '1px solid #ddd';
          statusCell.style.fontWeight = 'bold';

          row.appendChild(dateCell);
          row.appendChild(membersCell);
          row.appendChild(statusCell);
          tbody.appendChild(row);
        });
        table.appendChild(tbody);
        tempContainer.appendChild(table);

        // Add to document temporarily
        document.body.appendChild(tempContainer);

        // Wait a bit for rendering
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture with html2canvas
        const canvas = await html2canvas(tempContainer, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: tempContainer.offsetWidth,
          height: tempContainer.offsetHeight,
          logging: false,
          imageTimeout: 15000
        });

        // Remove temporary container
        document.body.removeChild(tempContainer);

        // Convert canvas to blob
        canvas.toBlob((blob) => {
          if (blob) {
            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${rosterName || 'cleaning-schedule'}-${format(new Date(), 'yyyy-MM-dd')}.png`;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            URL.revokeObjectURL(url);
            
            toast({
              title: "Image Exported! 📸",
              description: "Schedule has been exported as an image",
            });
          }
        }, 'image/png', 0.95);

      } catch (error) {
        console.error('Error exporting as image:', error);
        toast({
          title: "Export Failed",
          description: "Failed to export schedule as image. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsExporting(false);
      }
    };

    const exportAsPDF = async () => {
      if (assignments.length === 0) {
        toast({
          title: "No Schedule to Export",
          description: "Please generate a schedule first",
          variant: "destructive"
        });
        return;
      }

      setIsExporting(true);
      try {
        // Create PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        let yPosition = 20;
        const pageWidth = 210;
        const margin = 20;
        const contentWidth = pageWidth - (2 * margin);

        // Add title
        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.text('House Cleaning Schedule', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 15;

        // Add roster info
        if (rosterName) {
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`Roster: ${rosterName}`, pageWidth / 2, yPosition, { align: 'center' });
          yPosition += 10;
        }

        // Add date range
        if (startDate && endDate) {
          pdf.setFontSize(12);
          pdf.text(`Period: ${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`, pageWidth / 2, yPosition, { align: 'center' });
          yPosition += 15;
        }

        // Add generation date
        pdf.setFontSize(10);
        pdf.text(`Generated on: ${format(new Date(), 'PPP')}`, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 20;

        // Add member counts section
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Assignment Counts', margin, yPosition);
        yPosition += 10;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        Object.entries(assignedCounts).forEach(([name, count]) => {
          const text = `${name}: ${count} assignment${count === 1 ? '' : 's'}`;
          pdf.text(text, margin + 5, yPosition);
          yPosition += 6;
        });

        yPosition += 10;

        // Check if we need a new page
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = 20;
        }

        // Add schedule table
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Weekly Schedule', margin, yPosition);
        yPosition += 10;

        // Table headers with background color
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        const colWidths = [50, 80, 30];
        const colX = [margin, margin + 50, margin + 130];
        
        // Add header background color
        pdf.setFillColor(227, 242, 253); // Light blue background for headers
        pdf.rect(margin, yPosition - 8, pageWidth - (2 * margin), 10, 'F');
        
        // Add header text with darker color
        pdf.setTextColor(21, 101, 192); // Darker blue text for headers
        pdf.text('Date', colX[0], yPosition);
        pdf.text('Members', colX[1], yPosition);
        pdf.text('Status', colX[2], yPosition);
        yPosition += 8;

        // Reset text color for content
        pdf.setTextColor(0, 0, 0); // Black text for content
        
        // Draw header line
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 5;

        // Table content
        pdf.setFont('helvetica', 'normal');
        assignments.forEach((assignment, index) => {
          // Check if we need a new page
          if (yPosition > 270) {
            pdf.addPage();
            yPosition = 20;
          }

                     // Add attractive alternating row background colors for better readability
           const isEvenRow = index % 2 === 0;
           if (isEvenRow) {
             pdf.setFillColor(240, 248, 255); // Light blue tint for even rows
             pdf.rect(margin, yPosition - 2, pageWidth - (2 * margin), 8, 'F');
           } else {
             pdf.setFillColor(250, 250, 250); // Light gray for odd rows
             pdf.rect(margin, yPosition - 2, pageWidth - (2 * margin), 8, 'F');
           }

          const dateText = format(new Date(assignment.date), "MMM do");
          let membersText = '';
          let statusText = '';

          if (assignment.assignments) {
            membersText = assignment.assignments.map(a => a.memberName).join(', ');
            const completedCount = assignment.assignments.filter(a => a.isCompleted).length;
            const totalCount = assignment.assignments.length;
            statusText = `${completedCount}/${totalCount}`;
          } else {
            membersText = assignment.members.join(', ');
            statusText = '0/2';
          }

          // Wrap text if needed
          const wrappedMembers = pdf.splitTextToSize(membersText, colWidths[1] - 5);
          
          pdf.text(dateText, colX[0], yPosition);
          pdf.text(wrappedMembers, colX[1], yPosition);
          pdf.text(statusText, colX[2], yPosition);

          // Calculate height for this row
          const rowHeight = Math.max(6, wrappedMembers.length * 4);
          yPosition += rowHeight + 2;

          // Draw row line
          pdf.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 3;
        });

        // Save PDF
        const fileName = `${rosterName || 'cleaning-schedule'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
        pdf.save(fileName);

        toast({
          title: "PDF Exported! 📄",
          description: "Schedule has been exported as a PDF",
        });

      } catch (error) {
        console.error('Error exporting as PDF:', error);
        toast({
          title: "Export Failed",
          description: "Failed to export schedule as PDF. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsExporting(false);
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

                   {/* How to Use Guide */}
          <div className="glass p-6 rounded-2xl border-2 border-border/20 animate-fade-in">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-foreground">How to Use This App</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
                <div className="space-y-3">
                  <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl mx-auto">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">1. Add Team Members</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter the names of everyone who will participate in the cleaning schedule
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-xl mx-auto">
                    <CalendarDays className="h-6 w-6 text-accent" />
                  </div>
                  <h3 className="font-semibold text-foreground">2. Select Date Range</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose the start and end dates for your cleaning schedule
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-center w-12 h-12 bg-success/10 rounded-xl mx-auto">
                    <Sparkles className="h-6 w-6 text-success" />
                  </div>
                  <h3 className="font-semibold text-foreground">3. Generate & Save</h3>
                  <p className="text-sm text-muted-foreground">
                    Click "Generate Schedule" to create a fair rotation, then save it for later use
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-center w-12 h-12 bg-warning/10 rounded-xl mx-auto">
                    <RefreshCw className="h-6 w-6 text-warning" />
                  </div>
                  <h3 className="font-semibold text-foreground">4. Load & Manage</h3>
                  <p className="text-sm text-muted-foreground">
                    Load saved schedules and use the Actions column to mark tasks complete or swap assignments
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                  <p className="text-sm text-muted-foreground">
                    <strong>Tip:</strong> The app automatically assigns 2 people per week and ensures no one works consecutive weeks for fair distribution.
                  </p>
                </div>
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-accent/5 rounded-xl border border-accent/20">
                    <h4 className="font-semibold text-foreground mb-2">Loading Saved Schedules</h4>
                    <p className="text-sm text-muted-foreground">
                      Click "Load" next to any saved roster in the "Saved Rosters" section to restore your previous schedule with all assignments and completion status.
                    </p>
                  </div>
                                     <div className="p-4 bg-success/5 rounded-xl border border-success/20">
                     <h4 className="font-semibold text-foreground mb-2">Managing Tasks</h4>
                     <p className="text-sm text-muted-foreground">
                       Use the three-dot menu in the Actions column to mark tasks complete, reopen completed tasks, or request swaps with other members on different dates.
                     </p>
                   </div>
                   <div className="p-4 bg-warning/5 rounded-xl border border-warning/20">
                     <h4 className="font-semibold text-foreground mb-2">Exporting Schedules</h4>
                     <p className="text-sm text-muted-foreground">
                       Use the export buttons to save your schedule as an image or PDF. Works on all devices including mobile phones and tablets.
                     </p>
                   </div>
                </div>
              </div>
            </div>
          </div>

        <div className="space-y-8">
          {/* Saved Rosters Section */}
          <Card className="card-modern hover:shadow-glow transition-all duration-500">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-4 text-2xl">
                <div className="p-3 bg-gradient-secondary rounded-2xl">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                Saved Rosters
                <Button variant="outline" size="sm" className="ml-auto rounded-xl" onClick={loadRosters} disabled={isLoadingRosters}>
                  {isLoadingRosters ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {rosters.length === 0 ? (
                <div className="text-sm text-muted-foreground">No saved rosters yet.</div>
              ) : (
                <div className="space-y-2">
                  {rosters.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl ring-1 ring-border hover:bg-secondary/30 transition-all">
                      <div className="font-semibold truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground ml-auto">{format(new Date(r.start_date), 'MMM d, yyyy')} - {format(new Date(r.end_date), 'MMM d, yyyy')}</div>
                      <Button size="sm" className="rounded-xl" variant="secondary" onClick={() => handleSelectRoster(r.id)}>Load</Button>
                      <Button size="sm" className="rounded-xl" variant="destructive" onClick={() => handleDeleteRoster(r.id)}>
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Setup Roster and Date Range Section - Combined */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Setup Roster Section */}
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

            {/* Date Range Section */}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <Label className="block mb-1 text-sm font-semibold">Start Date</Label>
                    <Popover open={isStartOpen} onOpenChange={setIsStartOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-12 border-2 border-border/50 hover:border-primary focus:border-primary rounded-xl transition-all duration-300 justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-3 h-5 w-5" />
                          {startDate ? format(startDate, "PPP") : "Select start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass border-2 border-border/30" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => {
                            if (date) {
                              setStartDate(date);
                              if (endDate && endDate < date) setEndDate(date);
                              setIsStartOpen(false);
                            }
                          }}
                          disabled={(date: Date) => !!endDate && date > endDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-4">
                    <Label className="block mb-1 text-sm font-semibold">End Date</Label>
                    <Popover open={isEndOpen} onOpenChange={setIsEndOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-12 border-2 border-border/50 hover:border-primary focus:border-primary rounded-xl transition-all duration-300 justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-3 h-5 w-5" />
                          {endDate ? format(endDate, "PPP") : "Select end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass border-2 border-border/30" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => {
                            if (date) {
                              setEndDate(date);
                              if (startDate && startDate > date) setStartDate(date);
                              setIsEndOpen(false);
                            }
                          }}
                          disabled={(date: Date) => !!startDate && date < startDate}
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
               {/* Export buttons */}
               <div className="flex flex-wrap gap-3 mt-4">
                 <Button
                   onClick={exportAsImage}
                   disabled={isExporting}
                   variant="outline"
                   size="sm"
                   className="rounded-xl border-2 border-primary/30 hover:bg-primary hover:text-primary-foreground"
                 >
                   {isExporting ? (
                     <Loader2 className="h-4 w-4 animate-spin mr-2" />
                   ) : (
                     <Image className="h-4 w-4 mr-2" />
                   )}
                   Export as Image
                 </Button>
                 <Button
                   onClick={exportAsPDF}
                   disabled={isExporting}
                   variant="outline"
                   size="sm"
                   className="rounded-xl border-2 border-primary/30 hover:bg-primary hover:text-primary-foreground"
                 >
                   {isExporting ? (
                     <Loader2 className="h-4 w-4 animate-spin mr-2" />
                   ) : (
                     <FileText className="h-4 w-4 mr-2" />
                   )}
                   Export as PDF
                 </Button>
               </div>
             </CardHeader>
                         <CardContent>
               {/* Export container */}
               <div id="schedule-export">
                 {/* Assigned counts summary */}
                 <div className="glass p-4 rounded-xl border-2 border-border/20 mb-6">
                <div className="text-sm font-semibold text-muted-foreground mb-3">Counts</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Object.keys(assignedCounts).length > 0 ? (
                    Object.entries(assignedCounts)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([name, count]) => (
                        <div key={name} className="flex items-center gap-3 rounded-lg p-3 ring-1 ring-border w-full" style={{ backgroundColor: memberNameToColor[name] }}>
                          <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-offset-background" style={{ boxShadow: `0 0 0 3px ${memberNameToColor[name]}33` }}>
                            <AvatarImage alt={name} src={avatarUrlForName(name)} />
                            <AvatarFallback>{name.slice(0,2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-semibold truncate" style={{ color: getTextColorForBg(memberNameToColor[name]) }}>{name}</span>
                          <span
                            className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{
                              backgroundColor: getTextColorForBg(memberNameToColor[name]) === 'white' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)',
                              color: getTextColorForBg(memberNameToColor[name])
                            }}
                          >
                            {count} Count{count === 1 ? '' : 's'}
                          </span>
                        </div>
                      ))
                  ) : (
                    <div className="text-xs text-muted-foreground">No assignments yet</div>
                  )}
                        </div>
                      </div>
              <div className="mobile-table-container rounded-2xl border-2 border-border/30">
                <Table className="w-full mobile-table">
                                     <TableHeader>
                     <TableRow className="bg-blue-50 border-b-2 border-blue-200 hover:bg-blue-100">
                       <TableHead className="font-bold text-blue-800 text-base sm:text-lg p-3 sm:p-6">Date</TableHead>
                       <TableHead className="font-bold text-blue-800 text-base sm:text-lg p-3 sm:p-6">Members</TableHead>
                       <TableHead className="font-bold text-blue-800 text-base sm:text-lg p-3 sm:p-6">Actions</TableHead>
                     </TableRow>
                   </TableHeader>
                  <TableBody>
                    {assignments.map((assignment, index) => (
                                             <TableRow 
                         key={index} 
                         className={cn(
                           "border-b border-border/20 hover:bg-secondary/30 transition-all duration-300",
                           index % 2 === 0 ? "bg-blue-50/50" : "bg-gray-50/50"
                         )}
                         style={{ animationDelay: `${index * 100}ms` }}
                       >
                         <TableCell className="p-3 sm:p-6 font-semibold text-sm sm:text-lg">
                           {format(new Date(assignment.date), "EEEE, MMMM do, yyyy")}
                         </TableCell>
                          <TableCell className="p-3 sm:p-6">
                              <div className="space-y-3">
                                {assignment.assignments ? assignment.assignments.map((taskAssignment, memberIndex) => {
                                  // Check if this task was swapped (has swapped_with and accepted status)
                                  const wasSwapped = taskAssignment.swappedWith && taskAssignment.swapStatus === 'accepted';
                                  
                                  return (
                                    <div key={memberIndex} className="space-y-2">
                                      {/* First line: Member name and avatar with completion status */}
                                      <div className={cn(
                                        "flex items-center justify-between gap-3 p-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-300",
                                        taskAssignment.isCompleted ? "" : "opacity-60"
                                      )} style={{ backgroundColor: memberNameToColor[taskAssignment.memberName] || 'hsl(var(--primary))' }}>
                                        <div className="flex items-center gap-3">
                                          <Avatar className="h-8 w-8 ring-2 ring-white/30" style={{ boxShadow: `0 0 0 2px ${memberNameToColor[taskAssignment.memberName]}33` }}>
                                            <AvatarImage alt={taskAssignment.memberName} src={avatarUrlForName(taskAssignment.memberName)} />
                                            <AvatarFallback className="text-sm font-bold" style={{ color: getTextColorForBg(memberNameToColor[taskAssignment.memberName]) }}>
                                              {taskAssignment.memberName.slice(0,2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="text-white font-semibold truncate">{taskAssignment.memberName}</span>
                                        </div>
                                        {taskAssignment.isCompleted ? (
                                          <div className="flex items-center justify-center w-6 h-6 bg-white/20 rounded-full">
                                            <CheckSquare className="h-4 w-4 text-white flex-shrink-0" />
                                          </div>
                                        ) : (
                                          <Square className="h-5 w-5 text-white/70 flex-shrink-0" />
                                        )}
                                      </div>
                                      
                                                                             {/* Second line: Status information - only show for swap requests */}
                                       {taskAssignment.swapStatus === 'pending' && (
                                         <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 rounded-lg text-xs">
                                           <div className="flex items-center gap-2 text-warning">
                                             <ArrowRightLeft className="h-3 w-3" />
                                             <span className="font-medium">Swap request pending</span>
                                           </div>
                                         </div>
                                       )}
                                      
                                      {/* Third line: Swap indicator if task was swapped */}
                                      {wasSwapped && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg text-xs border border-primary/20">
                                          <ArrowRightLeft className="h-3 w-3 text-primary" />
                                          <span className="text-primary font-medium">
                                            Task swapped from another date
                                          </span>
                                          {taskAssignment.swapRequestedAt && (
                                            <span className="text-muted-foreground">
                                              • {format(new Date(taskAssignment.swapRequestedAt), "MMM d")}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }) : assignment.members.map((memberName, memberIndex) => (
                                  <div key={memberIndex} className="space-y-2">
                                    {/* First line: Member name and avatar */}
                                    <div className="flex items-center gap-3 p-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 opacity-60" style={{ backgroundColor: memberNameToColor[memberName] || 'hsl(var(--primary))' }}>
                                      <Avatar className="h-8 w-8 ring-2 ring-white/30" style={{ boxShadow: `0 0 0 2px ${memberNameToColor[memberName]}33` }}>
                                        <AvatarImage alt={memberName} src={avatarUrlForName(memberName)} />
                                        <AvatarFallback className="text-sm font-bold" style={{ color: getTextColorForBg(memberNameToColor[memberName]) }}>
                                          {memberName.slice(0,2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="text-white font-semibold truncate">{memberName}</span>
                                      <Square className="h-5 w-5 text-white/70 flex-shrink-0 ml-auto" />
                                    </div>
                                    {/* Second line: Status information - only show for completed tasks */}
                                    {false && (
                                      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 rounded-lg text-xs">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <Square className="h-3 w-3" />
                                          <span className="font-medium">Task pending completion</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                           </TableCell>
                          <TableCell className="p-3 sm:p-6">
                            <div className="space-y-3">
                              {assignment.assignments ? assignment.assignments.map((taskAssignment, memberIndex) => (
                                <div key={memberIndex} className="space-y-2">
                                                                     {/* First line: Status indicator and action button */}
                                   <div className="flex items-center justify-between gap-3 p-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 bg-secondary/20">
                                     <div className="flex items-center gap-2">
                                       {taskAssignment.isCompleted ? (
                                         <div className="flex items-center gap-1 text-success">
                                           <CheckSquare className="h-5 w-5" />
                                         </div>
                                       ) : taskAssignment.swapStatus === 'pending' ? (
                                         <div className="flex items-center gap-1 text-warning">
                                           <ArrowRightLeft className="h-4 w-4" />
                                           <span className="text-xs font-medium">Swap Pending</span>
                                         </div>
                                       ) : (
                                         <div className="flex items-center gap-1 text-muted-foreground">
                                           <Square className="h-4 w-4" />
                                         </div>
                                       )}
                                     </div>
                                                                           <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                          {taskAssignment.isCompleted ? (
                                            <span className="text-success font-medium">Completed</span>
                                          ) : (
                                            <>
                                              <span>Available actions for {taskAssignment.memberName}:</span>
                                              <span className="text-success font-medium">Complete Task</span>
                                              {taskAssignment.swapStatus !== 'pending' && (
                                                <span className="text-primary font-medium">• Request Swap</span>
                                              )}
                                            </>
                                          )}
                                        </div>
                                       <DropdownMenu>
                                         <DropdownMenuTrigger asChild>
                                           <Button variant="outline" size="sm" className="h-7 w-7 p-0 flex-shrink-0">
                                             <MoreHorizontal className="h-3 w-3" />
                                           </Button>
                                         </DropdownMenuTrigger>
                                         <DropdownMenuContent align="end" className="min-w-[180px]">
                                                                                       {!taskAssignment.isCompleted ? (
                                              <DropdownMenuItem 
                                                onClick={() => markTaskCompleted(taskAssignment.id, taskAssignment.memberId)}
                                                className="text-success cursor-pointer"
                                              >
                                                <CheckSquare className="h-4 w-4 mr-2" />
                                                Mark Complete
                                              </DropdownMenuItem>
                                            ) : (
                                              <DropdownMenuItem 
                                                onClick={() => markTaskIncomplete(taskAssignment.id)}
                                                className="text-warning cursor-pointer"
                                              >
                                                <Square className="h-4 w-4 mr-2" />
                                                Mark as Incomplete
                                              </DropdownMenuItem>
                                            )}
                                           {taskAssignment.swapStatus === 'pending' && (
                                             <>
                                               <DropdownMenuItem 
                                                 onClick={() => respondToSwapRequest(taskAssignment.id, 'accepted')}
                                                 className="text-success cursor-pointer"
                                               >
                                                 <CheckCircle className="h-4 w-4 mr-2" />
                                                 Accept Swap
                                               </DropdownMenuItem>
                                               <DropdownMenuItem 
                                                 onClick={() => respondToSwapRequest(taskAssignment.id, 'rejected')}
                                                 className="text-destructive cursor-pointer"
                                               >
                                                 <AlertCircle className="h-4 w-4 mr-2" />
                                                 Reject Swap
                                               </DropdownMenuItem>
                                             </>
                                           )}
                                           {!taskAssignment.isCompleted && taskAssignment.swapStatus !== 'pending' && (
                                             <DropdownMenuItem 
                                               onClick={() => openSwapDialog(
                                                 taskAssignment.id, 
                                                 taskAssignment.memberId, 
                                                 taskAssignment.memberName, 
                                                 assignment.date
                                               )}
                                               className={taskAssignment.id && taskAssignment.id !== '' ? "text-primary cursor-pointer" : "text-muted-foreground"}
                                               disabled={!taskAssignment.id || taskAssignment.id === ''}
                                             >
                                               <ArrowRightLeft className="h-4 w-4 mr-2" />
                                               {taskAssignment.id && taskAssignment.id !== '' ? "Request Swap" : "Save First"}
                                             </DropdownMenuItem>
                                           )}
                                         </DropdownMenuContent>
                                       </DropdownMenu>
                                     </div>
                                   </div>
                                </div>
                              )) : assignment.members.map((memberName, memberIndex) => (
                                <div key={memberIndex} className="space-y-2">
                                                                     {/* First line: Status indicator */}
                                   <div className="flex items-center justify-between gap-3 p-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 bg-secondary/20">
                                     <div className="flex items-center gap-2">
                                       <div className="flex items-center gap-1 text-muted-foreground">
                                         <Square className="h-4 w-4" />
                                       </div>
                                     </div>
                                     <div className="flex items-center gap-2">
                                       <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                         <span>Available actions for {memberName}:</span>
                                         <span className="text-muted-foreground font-medium">Save roster first</span>
                                       </div>
                                     </div>
                                   </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                       </TableRow>
                    ))}
                  </TableBody>
                                 </Table>
                 </div>
               </div>
             </CardContent>
           </Card>
                 )}

                 {/* Task Swap Dialog */}
         <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
           <DialogContent className="glass border-2 border-border/30 max-w-lg">
             <DialogHeader>
               <DialogTitle className="flex items-center gap-3 text-xl">
                 <ArrowRightLeft className="h-6 w-6 text-primary" />
                 Swap Task Assignment
               </DialogTitle>
               <DialogDescription className="text-muted-foreground">
                 Select a different date and member to swap with {selectedAssignmentForSwap?.memberName}.
               </DialogDescription>
             </DialogHeader>
             
             <div className="space-y-6">
               {/* Current Assignment */}
               <div className="p-4 bg-primary/10 rounded-xl border-2 border-primary/20">
                 <div className="flex items-center gap-3">
                   <Avatar className="h-8 w-8" style={{ backgroundColor: memberNameToColor[selectedAssignmentForSwap?.memberName || ''] }}>
                     <AvatarImage src={avatarUrlForName(selectedAssignmentForSwap?.memberName || '')} />
                     <AvatarFallback className="text-sm font-bold text-white">
                       {selectedAssignmentForSwap?.memberName?.slice(0,2).toUpperCase()}
                     </AvatarFallback>
                   </Avatar>
                   <div>
                     <div className="font-semibold">{selectedAssignmentForSwap?.memberName}</div>
                     <div className="text-sm text-muted-foreground">
                       Currently assigned to {selectedAssignmentForSwap?.date ? format(new Date(selectedAssignmentForSwap.date), "EEEE, MMMM do, yyyy") : 'this date'}
                     </div>
                   </div>
                 </div>
               </div>

               {/* Target Date Selection */}
               <div className="space-y-3">
                 <Label className="text-sm font-semibold">Select Target Date:</Label>
                 <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                   {assignments
                     .filter(a => a.date !== selectedAssignmentForSwap?.date)
                     .map((assignment) => (
                       <button
                         key={assignment.date}
                         onClick={() => setSwapTargetDate(assignment.date)}
                         className={cn(
                           "p-3 rounded-xl border-2 text-left transition-all duration-300",
                           swapTargetDate === assignment.date
                             ? "border-primary bg-primary/10"
                             : "border-border/30 hover:border-primary/50 hover:bg-primary/5"
                         )}
                       >
                         <div className="font-semibold">{format(new Date(assignment.date), "EEEE, MMMM do, yyyy")}</div>
                         <div className="text-sm text-muted-foreground">
                           {assignment.assignments?.map(a => a.memberName).join(", ")}
                         </div>
                       </button>
                     ))}
                 </div>
               </div>

               {/* Target Member Selection */}
               {swapTargetDate && (
                 <div className="space-y-3">
                   <Label className="text-sm font-semibold">Select Member to Swap With:</Label>
                   <div className="grid grid-cols-1 gap-2">
                     {assignments
                       .find(a => a.date === swapTargetDate)
                       ?.assignments?.filter(ta => !ta.isCompleted)
                       .map((targetAssignment) => (
                         <button
                           key={targetAssignment.memberId}
                           onClick={() => setSwapTargetMember(targetAssignment.memberName)}
                           className={cn(
                             "p-3 rounded-xl border-2 text-left transition-all duration-300",
                             swapTargetMember === targetAssignment.memberName
                               ? "border-primary bg-primary/10"
                               : "border-border/30 hover:border-primary/50 hover:bg-primary/5"
                           )}
                         >
                           <div className="flex items-center gap-3">
                             <Avatar className="h-6 w-6" style={{ backgroundColor: memberNameToColor[targetAssignment.memberName] }}>
                               <AvatarImage src={avatarUrlForName(targetAssignment.memberName)} />
                               <AvatarFallback className="text-xs font-bold text-white">
                                 {targetAssignment.memberName.slice(0,2).toUpperCase()}
                               </AvatarFallback>
                             </Avatar>
                             <div>
                               <div className="font-semibold">{targetAssignment.memberName}</div>
                               <div className="text-sm text-muted-foreground">
                                 Assigned to {format(new Date(swapTargetDate), "EEEE, MMMM do, yyyy")}
                               </div>
                             </div>
                           </div>
                         </button>
                       ))}
                   </div>
                 </div>
               )}

               {/* Action Buttons */}
               <div className="flex gap-3 pt-4">
                 <Button
                   variant="outline"
                   onClick={() => {
                     setSwapDialogOpen(false);
                     setSelectedAssignmentForSwap(null);
                     setSwapTargetDate("");
                     setSwapTargetMember("");
                   }}
                   className="flex-1"
                 >
                   Cancel
                 </Button>
                 <Button
                   onClick={executeSwap}
                   disabled={!swapTargetDate || !swapTargetMember}
                   className="flex-1 btn-gradient"
                 >
                   <ArrowRightLeft className="h-4 w-4 mr-2" />
                   Execute Swap
                 </Button>
               </div>
             </div>
           </DialogContent>
         </Dialog>
      </div>
    </div>
  );
 };