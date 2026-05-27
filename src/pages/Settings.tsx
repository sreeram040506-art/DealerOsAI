import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from '@/components/ui/toast-utils';
import { Building2, Save, Upload, MapPin, Phone, Mail, Loader2 } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import AppLayout from '@/components/AppLayout';

const Settings = () => {
  const { token, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    logoBase64: ''
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(apiUrl('/dealerships/profile'), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setProfile({
            name: data.name || '',
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            logoBase64: data.logoBase64 || ''
          });
        }
      } catch (error) {
        toast.error('Failed to load dealership profile');
      } finally {
        setIsLoading(false);
      }
    };

    if (token) fetchProfile();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(apiUrl('/dealerships/profile'), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profile),
      });

      if (response.ok) {
        toast.success('Dealership profile updated successfully');
        // Optional: reload page to update logo in sidebar
        // window.location.reload();
      } else {
        const data = await response.json();
        toast.error(data.message || 'Update failed');
      }
    } catch (error) {
      toast.error('Connection error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfile(prev => ({ ...prev, logoBase64: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-display font-bold text-foreground">Dealership Settings</h1>
          <p className="text-muted-foreground">Manage your dealership profile and branding</p>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo Section */}
          <Card className="md:col-span-1 bg-muted/30 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Dealership Logo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              <div className="relative w-32 h-32 rounded-2xl bg-card border-2 border-dashed border-border/50 flex items-center justify-center overflow-hidden group">
                {profile.logoBase64 ? (
                  <img src={profile.logoBase64} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <Building2 className="w-12 h-12 text-muted-foreground/30" />
                )}
                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Upload className="text-white w-6 h-6" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Recommended: 512x512px SVG or PNG with transparent background
              </p>
            </CardContent>
          </Card>

          {/* Details Section */}
          <Card className="md:col-span-2 bg-muted/30 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Business Information</CardTitle>
              <CardDescription>Public details for your dealership</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dealership Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      value={profile.name} 
                      onChange={e => setProfile({...profile, name: e.target.value})}
                      className="pl-10 bg-card/50 border-border/50 focus:border-primary/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Business Address</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      value={profile.address} 
                      onChange={e => setProfile({...profile, address: e.target.value})}
                      className="pl-10 bg-card/50 border-border/50 focus:border-primary/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        value={profile.phone} 
                        onChange={e => setProfile({...profile, phone: e.target.value})}
                        className="pl-10 bg-card/50 border-border/50 focus:border-primary/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        value={profile.email} 
                        onChange={e => setProfile({...profile, email: e.target.value})}
                        className="pl-10 bg-card/50 border-border/50 focus:border-primary/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border/50 bg-muted/20 pt-6">
              <Button 
                type="submit" 
                className="ml-auto bg-primary hover:bg-primary/90 text-white gap-2 font-bold px-8"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </AppLayout>
  );
};

export default Settings;
