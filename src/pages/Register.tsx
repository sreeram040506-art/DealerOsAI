import { useState } from 'react';
import { useAuth } from '@/context/auth-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from '@/components/ui/toast-utils';
import { Car, Building2, User, Mail, Lock } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { Link } from 'react-router-dom';

const Register = () => {
  const [dealershipName, setDealershipName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/dealerships/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealershipName, adminName, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
        toast.success(`Welcome, ${data.user.name}! Your dealership ${data.user.dealership.name} has been created.`);
      } else {
        toast.error(data.message || 'Registration failed');
      }
    } catch (error) {
      toast.error('Connection error. Is the server running?');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-card p-4 relative overflow-hidden">
      {/* Minimalist Background */}
      <div className="absolute inset-0 bg-background" />
      
      <Card className="w-full max-w-md bg-card/80 backdrop-blur-xl border-border shadow-2xl relative z-10">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="mx-auto w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center mb-2 border border-primary/10 shadow-sm">
            <Building2 className="text-primary w-6 h-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-display text-foreground">Launch Your Dealership</CardTitle>
            <CardDescription className="text-muted-foreground font-medium">
              Join the AutoProfitHub SaaS platform
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dealershipName" className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-3 h-3" /> Dealership Name
              </Label>
              <Input 
                id="dealershipName" 
                placeholder="Elite Motors LLC" 
                className="bg-card/30 border-border/50 text-foreground h-10 transition-all" 
                value={dealershipName}
                onChange={(e) => setDealershipName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminName" className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider flex items-center gap-2">
                <User className="w-3 h-3" /> Admin Name
              </Label>
              <Input 
                id="adminName" 
                placeholder="John Doe" 
                className="bg-card/30 border-border/50 text-foreground h-10 transition-all" 
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-3 h-3" /> Business Email
              </Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="admin@dealership.com" 
                className="bg-card/30 border-border/50 text-foreground h-10 transition-all" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider flex items-center gap-2">
                <Lock className="w-3 h-3" /> Password
              </Label>
              <Input 
                id="password" 
                type="password" 
                className="bg-card/30 border-border/50 text-foreground h-10 transition-all" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2 flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 text-base shadow-md"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Get Started Now'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Already have a dealership?{' '}
              <Link to="/login" className="text-primary hover:underline font-bold">
                Sign In
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Register;
