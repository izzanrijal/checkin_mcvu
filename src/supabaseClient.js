import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

// Auth helpers
export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Create a service role client for bypassing RLS when needed
const createServiceClient = () => {
  const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabase; // Fallback to regular client
};

// Check in participant at a specific gate
export const performCheckIn = async (qrCodeId, gateId, gateType, checkedInBy) => {
  try {
    console.log(`Checking in QR ${qrCodeId} at ${gateType} ${gateId} by ${checkedInBy}`);
    
    // Use service role client to bypass RLS for admin operations
    const client = createServiceClient();
    
    // 1. First, get the participant ID from the QR code
    const { data: qrData, error: qrError } = await client
      .from('participant_qr_codes')
      .select('participant_id, registration_id')
      .eq('qr_code_id', qrCodeId)
      .single();
    
    if (qrError || !qrData) {
      console.error('QR code not found or error:', qrError);
      return { 
        success: false, 
        message: 'QR code not found', 
        error: qrError 
      };
    }
    
    const participantId = qrData.participant_id;
    
    console.log(`Found participant ${participantId} for check-in`);
    
    // 2. Check if participant is already checked in at this gate
    const { data: existingCheckIn, error: checkError } = await client
      .from('gate_check_ins')
      .select('id, checked_in_at')
      .eq('participant_id', participantId)
      .eq('gate_id', gateId)
      .eq('gate_type', gateType)
      .maybeSingle();
    
    if (checkError) {
      console.error('Error checking existing check-in:', checkError);
      // Continue anyway - treat as not checked in yet
    }
    
    if (existingCheckIn) {
      console.log('Participant already checked in at:', existingCheckIn.checked_in_at);
      return { 
        success: false, 
        message: `Already checked in at ${new Date(existingCheckIn.checked_in_at).toLocaleTimeString()}`,
        data: existingCheckIn,
        alreadyCheckedIn: true
      };
    }
    
    // 3. Create the check-in record in the new gate_check_ins table
    const checkInData = {
      participant_id: participantId,
      gate_id: gateId,
      gate_type: gateType,
      checked_in_by: checkedInBy,
      checked_in_at: new Date().toISOString()
    };
    
    const { data: insertResult, error: insertError } = await client
      .from('check_ins')
      .insert([checkInData]);
    
    if (insertError) {
      console.error('Check-in insert error:', insertError);
      return { data: null, error: insertError };
    }
    
    // 6. Also update the participant status if needed
    // This step depends on your specific business logic
    
    return { 
      data: { success: true }, 
      error: null 
    };
  } catch (error) {
    console.error('Check-in error:', error);
    return { data: null, error };
  }
};

// Get gate participants with proper structure based on database schema
export const getGateParticipants = async (gateId, gateType) => {
  try {
    console.log(`Fetching participants for ${gateType} ${gateId}`);
    
    // Create Supabase admin client with service role key
    const client = createServiceClient();
    
    // Get gate details
    let gate;
    if (gateType === 'workshop') {
      const { data, error } = await client
        .from('workshops')
        .select('*')
        .eq('id', gateId)
        .single();
      
      if (error) {
        console.error('Workshop fetch error:', error);
        return { data: null, error };
      }
      
      gate = { ...data, type: 'workshop' };
    } else {
      const { data, error } = await client
        .from('tickets')
        .select('*')
        .eq('id', gateId)
        .single();
      
      if (error) {
        console.error('Ticket fetch error:', error);
        return { data: null, error };
      }
      
      gate = { ...data, type: 'ticket' };
    }
    
    // Get participants from the new view, filtered by gate
    console.log('Fetching participants from gate_participants_view...');
    const { data: participants, error: participantsError } = await client
      .from('gate_participants_view')
      .select('*')
      .eq('gate_id', gateId)
      .eq('gate_type', gateType);
    
    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return { data: null, error: participantsError };
    }

    console.log(`Found ${participants?.length || 0} participants in view`);

    // Process participants data to match the expected format in components
    const formattedParticipants = participants.map(participant => {
      return {
        id: participant.participant_id,
        name: participant.full_name,
        nik: participant.nik,
        institution: participant.institution,
        email: participant.email,
        phone: participant.phone,
        type: participant.participant_type,
        qr_code: participant.qr_code_id,
        registration_id: participant.registration_id,
        payment_status: participant.payment_status || 'unverified',
        checked_in: participant.checked_in,
        checked_in_at: participant.checked_in_at
      };
    });

    return {
      data: {
        gate,
        participants: formattedParticipants
      }
    };
  } catch (error) {
    console.error('Error in getGateParticipants:', error);
    return { data: null, error };
  }
};

// Get gates (workshops + symposium) with proper type identification
export const getGates = async () => {
  try {
    // Use service role client to bypass RLS
    const client = createServiceClient();
    
    // Get workshops
    const { data: workshops, error: workshopsError } = await client
      .from('workshops')
      .select('id, title, start_time, end_time, is_active')
      .eq('is_active', true)
      .order('sort_order');

    // Get symposium from tickets
    const { data: tickets, error: ticketsError } = await client
      .from('tickets')
      .select('id, name, start_date, end_date')
      .eq('includes_symposium', true);

    if (workshopsError || ticketsError) {
      return { data: null, error: workshopsError || ticketsError };
    }

    // Combine workshops and symposium as gates
    const gates = [
      ...(workshops || []).map(w => ({
        id: w.id,
        name: w.title,
        type: 'workshop',
        start_time: w.start_time,
        end_time: w.end_time
      })),
      ...(tickets || []).map(t => ({
        id: t.id,
        name: t.name,
        type: 'symposium',
        start_time: t.start_date,
        end_time: t.end_date
      }))
    ];

    return { data: gates, error: null };
  } catch (error) {
    console.error('Error in getGates:', error);
    return { data: null, error };
  }
};