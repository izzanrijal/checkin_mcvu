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

// Perform check-in for a participant at a gate
export const performCheckIn = async (participantId, gateId, gateType, checkedInBy) => {
  try {
    // Use service role client to bypass RLS
    const client = createServiceClient();
    
    // Check if participant is registered for this gate
    console.log(`Verifying participant ${participantId} is registered for gate ${gateId}`);
    const { data: registrations, error: regError } = await client
      .from('participant_gate_relations')
      .select('*')
      .eq('participant_id', participantId)
      .eq('gate_id', gateId)
      .eq('gate_type', gateType);
    
    if (regError) {
      console.error('Error checking participant registration:', regError);
      return { 
        success: false, 
        error: { 
          message: 'Gagal memeriksa registrasi peserta',
          code: 'REGISTRATION_CHECK_ERROR'
        }
      };
    }
    
    if (!registrations || registrations.length === 0) {
      console.log(`Participant ${participantId} is not registered for gate ${gateId}`);
      return { 
        success: false, 
        error: { 
          message: 'Peserta tidak terdaftar untuk kegiatan ini',
          code: 'NOT_REGISTERED'
        }
      };
    }
    
    // Check if already checked in at this gate
    console.log(`Checking if participant ${participantId} is already checked in at gate ${gateId}`);
    const { data: existingCheckIns, error: checkError } = await client
      .from('gate_check_ins')
      .select('id, checked_in_at')
      .eq('participant_id', participantId)
      .eq('gate_id', gateId)
      .eq('gate_type', gateType);
    
    if (checkError) {
      console.error('Error checking existing check-ins:', checkError);
      return { 
        success: false, 
        error: { 
          message: 'Gagal memeriksa status check-in',
          code: 'CHECK_IN_STATUS_ERROR'
        }
      };
    }
    
    if (existingCheckIns && existingCheckIns.length > 0) {
      console.log('Participant already checked in at this gate');
      return { 
        success: false, 
        alreadyCheckedIn: true,
        checkedInAt: existingCheckIns[0].checked_in_at,
        error: { 
          message: 'Peserta sudah melakukan check-in pada kegiatan ini',
          code: 'ALREADY_CHECKED_IN'
        }
      };
    }
    
    // Perform the check-in
    console.log(`Performing check-in for participant ${participantId} at gate ${gateId}`);
    const timestamp = new Date().toISOString();
    
    const { data: checkInData, error: insertError } = await client
      .from('gate_check_ins')
      .insert({
        participant_id: participantId,
        gate_id: gateId,
        gate_type: gateType,
        checked_in_by: checkedInBy,
        checked_in_at: timestamp
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error inserting check-in record:', insertError);
      return { 
        success: false, 
        error: { 
          message: 'Gagal merekam check-in',
          code: 'RECORD_CHECK_IN_ERROR'
        }
      };
    }
    
    console.log('Check-in successful:', checkInData);
    return { 
      success: true, 
      data: { 
        participant_id: participantId,
        gate_id: gateId,
        gate_type: gateType,
        checkInId: checkInData.id,
        timestamp
      }
    };
    
  } catch (error) {
    console.error('Error in performCheckIn:', error);
    return { 
      success: false, 
      error: { 
        message: 'Terjadi kesalahan tidak terduga saat melakukan check-in',
        code: 'UNEXPECTED_ERROR'
      }
    };
  }
};

// Get participants for a specific gate (workshop or symposium)
export const getGateParticipants = async (gateId, gateType) => {
  try {
    // Use service role client to bypass RLS
    const client = createServiceClient();
    
    console.log(`Fetching gate details for ${gateId} (${gateType})`);
    let gate = {};
    
    // Get gate details based on type
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
    console.log('Fetching participants from participant_gate_relations...');
    const { data: participants, error: participantsError } = await client
      .from('participant_gate_relations')
      .select('*')
      .eq('gate_id', gateId)
      .eq('gate_type', gateType === 'ticket' ? 'symposium' : gateType);
    
    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return { data: null, error: participantsError };
    }

    console.log(`Found ${participants?.length || 0} participants for gate ${gateId}`);

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

// Get a participant by QR code
export const getParticipantByQrCode = async (qrCode) => {
  try {
    // Use service role client to bypass RLS
    const client = createServiceClient();
    
    // First, verify the QR code exists
    const { data: qrData, error: qrError } = await client
      .from('participant_qr_codes')
      .select('participant_id')
      .eq('qr_code_id', qrCode)
      .single();
    
    if (qrError || !qrData) {
      console.error('Error fetching QR code or QR code not found:', qrError);
      return { 
        data: null, 
        error: { 
          message: 'QR code tidak ditemukan',
          code: 'QR_NOT_FOUND' 
        } 
      };
    }
    
    // Get participant details
    const { data: participant, error: participantError } = await client
      .from('participants')
      .select(`
        id,
        full_name,
        participant_type,
        nik,
        email,
        phone,
        institution
      `)
      .eq('id', qrData.participant_id)
      .single();
    
    if (participantError || !participant) {
      console.error('Error fetching participant:', participantError);
      return { 
        data: null, 
        error: { 
          message: 'Peserta tidak ditemukan',
          code: 'PARTICIPANT_NOT_FOUND'
        } 
      };
    }
    
    // Get all gates this participant is registered for
    const { data: gates, error: gatesError } = await client
      .from('participant_gate_relations')
      .select(`
        gate_id,
        gate_type,
        gate_name,
        checked_in,
        checked_in_at
      `)
      .eq('participant_id', participant.id);
    
    if (gatesError) {
      console.error('Error fetching participant gates:', gatesError);
      return { 
        data: null, 
        error: { 
          message: 'Gagal mengambil data kegiatan peserta',
          code: 'GATES_FETCH_ERROR'  
        } 
      };
    }
    
    // Format response
    const formattedParticipant = {
      id: participant.id,
      name: participant.full_name,
      type: participant.participant_type,
      nik: participant.nik,
      email: participant.email,
      phone: participant.phone,
      institution: participant.institution,
      qr_code: qrCode,
      gates: gates || []
    };
    
    return { 
      data: formattedParticipant 
    };
  } catch (error) {
    console.error('Error in getParticipantByQrCode:', error);
    return { 
      data: null, 
      error: { 
        message: 'Terjadi kesalahan saat memproses QR code',
        code: 'PROCESS_ERROR'
      } 
    };
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