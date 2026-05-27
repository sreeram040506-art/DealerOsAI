import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/auth-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from '@/components/ui/toast-utils';
import { Car } from 'lucide-react';
import { apiUrl } from '@/lib/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
        toast.success(`Welcome back, ${data.user.name}!`);
      } else {
        toast.error(data.message || 'Login failed');
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
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      <Card className="w-full max-w-md bg-card/80 backdrop-blur-xl border-border shadow-2xl animate-in fade-in zoom-in duration-700 relative z-10">
        <CardHeader className="space-y-3 text-center pb-8">
          <div className="mx-auto w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center mb-2 border border-primary/10 shadow-sm">
            <Car className="text-primary w-7 h-7" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-3xl font-display text-foreground tracking-tight">AutoProfitHub</CardTitle>
            <CardDescription className="text-muted-foreground font-medium">
              Dealer Management & Analytics Portal
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="email@autoprofithub.com" 
                className="bg-background border-border/80 text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-primary/20 h-11 transition-all shadow-sm" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Password</Label>
              <Input 
                id="password" 
                type="password" 
                className="bg-background border-border/80 text-foreground focus:border-primary/50 focus:ring-primary/20 h-11 transition-all shadow-sm" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="pt-4 flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 text-base shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? 'Authenticating...' : 'Secure Sign In'}
            </Button>
            <div className="text-center text-sm text-muted-foreground mt-2">
              Don't have a dealership yet?{' '}
              <Link to="/register" className="text-primary hover:underline font-bold">
                Get Started
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
      
      <div className="fixed bottom-6 text-muted-foreground text-[10px] uppercase tracking-[0.3em] font-bold z-0">
        © 2026 AutoProfitHub Systems
      </div>
    </div>
  );
};

export default Login;
