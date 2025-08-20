import { RosterScheduler } from "@/components/RosterScheduler";

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      
      {/* Main content */}
      <div className="relative z-10">
        <RosterScheduler />
      </div>
    </div>
  );
};

export default Index;
