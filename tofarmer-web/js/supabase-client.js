import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://afpzddwuikvwsedzgsee.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcHpkZHd1aWt2d3NlZHpnc2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTExNjEsImV4cCI6MjA5NDcyNzE2MX0.O_IezV8HpBjuZndnXosifts-jS7NnV4VtidyIX1KMHY';

window.supabaseClient = supabaseClient;

export const supabase = createClient(supabaseUrl, supabaseKey);