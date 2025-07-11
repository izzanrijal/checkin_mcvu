import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  global: {
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
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
      },
      global: {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
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
    
    // For symposium, we need to handle duplicate entries
    if (gateType === 'symposium') {
      console.log('Handling symposium check-in specially to avoid duplicates');
      
      // First, check if there are any duplicate participant_gate_relations entries for this symposium
      const { data: duplicateRelations, error: dupError } = await client
        .from('participant_gate_relations')
        .select('participant_id, gate_id') // Use existing columns instead of 'id'
        .eq('participant_id', participantId)
        .eq('gate_type', 'symposium')
        .eq('gate_id', gateId);
        
      if (dupError) {
        // Log error but continue with check-in process
        console.warn('Warning checking for duplicate relations (non-critical):', dupError);
      } else {
        console.log(`Found ${duplicateRelations?.length || 0} relations for this symposium`);
      }
      
      // Check if any previous check-ins for this symposium
      const { data: anyCheckIns, error: anyCheckError } = await client
        .from('gate_check_ins')
        .select('id')
        .eq('participant_id', participantId)
        .eq('gate_type', 'symposium')
        .eq('gate_id', gateId);
      
      if (anyCheckError) {
        console.error('Error checking for any check-ins:', anyCheckError);
      } else if (anyCheckIns && anyCheckIns.length > 0) {
        console.log(`Found ${anyCheckIns.length} previous check-ins, will delete them first`);
        
        // Delete any existing check-ins for this participant at this symposium
        const { error: deleteError } = await client
          .from('gate_check_ins')
          .delete()
          .eq('participant_id', participantId)
          .eq('gate_type', 'symposium')
          .eq('gate_id', gateId);
        
        if (deleteError) {
          console.error('Error deleting previous check-ins:', deleteError);
        }
      }
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
    
    // Get participants based on gate type
    if (gateType === 'workshop') {
      // For workshops, use the new complete_workshop_registration_view
      console.log('Fetching workshop participants from complete_workshop_registration_view...');
      const { data: workshopParticipants, error: workshopError } = await client
        .from('complete_workshop_registration_view')
        .select('*')
        .eq('workshop_id', gateId);
      
      if (workshopError) {
        console.error('Error fetching workshop participants:', workshopError);
        return { data: null, error: workshopError };
      }

      console.log(`Found ${workshopParticipants?.length || 0} workshop participants`);
      
      // Process workshop participants data
      const formattedParticipants = workshopParticipants.map(participant => {
        return {
          id: participant.participant_id,
          name: participant.participant_name,
          nik: participant.nik,
          institution: participant.institution,
          email: participant.participant_email,
          phone: participant.participant_phone,
          type: participant.participant_type,
          qr_code: participant.qr_code_id,
          registration_id: participant.registration_id,
          payment_status: participant.payment_status || 'unverified',
          checked_in: participant.checked_in,
          checked_in_at: participant.checked_in_at,
          checked_in_by_email: participant.checked_in_by_email
        };
      });

      return {
        data: {
          gate,
          participants: formattedParticipants
        }
      };
    } else {
      // For symposium/tickets, use unique_symposium_participant_view which deduplicates in real-time
      // This ensures new registrations from the main ticketing system are always reflected
      console.log('Fetching symposium participants from unique_symposium_participant_view...');
      const { data: symposiumParticipants, error: symposiumError } = await client
        .from('unique_symposium_participant_view')
        .select('*')
        .eq('symposium_id', gateId);
      
      if (symposiumError) {
        console.error('Error fetching symposium participants:', symposiumError);
        return { data: null, error: symposiumError };
      }

      console.log(`Found ${symposiumParticipants?.length || 0} symposium participants for gate ${gateId}`);
      
      // Log for debugging to check if we're getting duplicates
      if (symposiumParticipants && symposiumParticipants.length > 0) {
        const uniqueParticipantCount = new Set(symposiumParticipants.map(p => p.participant_id)).size;
        console.log(`Found ${uniqueParticipantCount} unique participants out of ${symposiumParticipants.length} total rows`);
      }
    
      // Process symposium participants data
      const formattedParticipants = symposiumParticipants.map(participant => {
        return {
          id: participant.participant_id,
          name: participant.participant_name,
          nik: participant.nik,
          institution: participant.institution,
          email: participant.participant_email,
          phone: participant.participant_phone,
          type: participant.participant_type,
          qr_code: participant.qr_code_id,
          registration_id: participant.registration_id,
          payment_status: participant.payment_status || 'unverified',
          checked_in: participant.checked_in,
          checked_in_at: participant.checked_in_at,
          checked_in_by_email: participant.checked_in_by_email
        };
      });

      return {
        data: {
          gate,
          participants: formattedParticipants
        }
      };
    }
  } catch (error) {
    console.error('Error in getGateParticipants:', error);
    return { data: null, error };
  }
};

// Get a participant by QR code - REFACTORED to use deduplicated views
export const getParticipantByQrCode = async (qrCode) => {
  try {
    console.log('Starting QR code lookup for:', qrCode);
    
    // Use service role client to bypass RLS
    const client = createServiceClient();
    
    // Clean the QR code to remove any whitespace
    const cleanQrCode = qrCode.trim();
    console.log('Cleaned QR code:', cleanQrCode);
    
    // STEP 1: Verify the QR code exists and get participant_id
    console.log('Checking participant_qr_codes table for QR:', cleanQrCode);
    const { data: qrData, error: qrError } = await client
      .from('participant_qr_codes')
      .select('participant_id')
      .eq('qr_code_id', cleanQrCode)
      .single();
    
    if (qrError || !qrData || !qrData.participant_id) {
      console.error('Error or no data when fetching QR code:', qrError);
      return { 
        data: null, 
        error: { 
          message: 'QR code tidak ditemukan',
          code: 'QR_NOT_FOUND',
          details: qrError
        } 
      };
    }
    
    const participantId = qrData.participant_id;
    console.log('Found participant_id:', participantId);
    
    // STEP 2: Fetch participant basic data (try from either symposium or workshop view)
    // First try symposium data
    const { data: symposiumData, error: symposiumError } = await client
      .from('unique_symposium_participant_view')
      .select('*')
      .eq('participant_id', participantId)
      .limit(1)
      .maybeSingle(); // Use maybeSingle to avoid error if not found
    
    // If we didn't find symposium data, try workshop data
    const { data: workshopData, error: workshopError } = !symposiumData ? await client
      .from('complete_workshop_registration_view')
      .select('*')
      .eq('participant_id', participantId)
      .limit(1)
      .maybeSingle() : { data: null, error: null };
    
    // If we can't find the participant in either view, return error
    if (!symposiumData && !workshopData) {
      console.error('Participant not found in any view');
      return {
        data: null,
        error: {
          message: 'Peserta tidak ditemukan',
          code: 'PARTICIPANT_NOT_FOUND'
        }
      };
    }
    
    // STEP 3: Fetch all registered activities (gates) from the deduplicated views
    
    // 3.1: Get symposium registrations from deduplicated view
    console.log('Fetching symposium registrations from unique_symposium_participant_view');
    const { data: symposiumActivities, error: symposiumActivitiesError } = await client
      .from('unique_symposium_participant_view')
      .select('*')
      .eq('participant_id', participantId);
    
    // 3.2: Get workshop registrations from deduplicated view
    console.log('Fetching workshop registrations from complete_workshop_registration_view');
    const { data: workshopActivities, error: workshopActivitiesError } = await client
      .from('complete_workshop_registration_view')
      .select('*')
      .eq('participant_id', participantId);
    
    // 3.3: Format symposium activities to match gates format
    const formattedSymposiumActivities = !symposiumActivitiesError && symposiumActivities ? 
      symposiumActivities.map(activity => ({
        participant_id: activity.participant_id,
        gate_id: activity.symposium_id,
        gate_name: activity.symposium_name,
        gate_type: 'symposium',
        checked_in: activity.checked_in || false,
        checked_in_at: activity.checked_in_at || null
      })) : [];
    
    // 3.4: Format workshop activities to match gates format
    const formattedWorkshopActivities = !workshopActivitiesError && workshopActivities ? 
      workshopActivities.map(activity => ({
        participant_id: activity.participant_id,
        gate_id: activity.workshop_id,
        gate_name: activity.workshop_name,
        gate_type: 'workshop',
        checked_in: activity.checked_in || false,
        checked_in_at: activity.checked_in_at || null
      })) : [];
    
    // 3.5: Combine all activities
    const participantGates = [...formattedSymposiumActivities, ...formattedWorkshopActivities];
    console.log(`Found ${participantGates.length} registered activities (deduplicated) for participant`);
    
    // STEP 4: Create the participant data object using data from either view
    let formattedParticipant;
    
    // Determine payment status from any available source
    // If verified in either symposium or workshop data, consider as paid
    let consolidatedPaymentStatus = 'unpaid';
    
    // Helper function to check if payment is verified
    const isPaymentVerified = (status) => {
      return status === 'verified' || status === 'paid';
    };
    
    // Check symposium data for payment status
    if (symposiumData && isPaymentVerified(symposiumData.payment_status)) {
      consolidatedPaymentStatus = 'paid';
      console.log('Payment verified from symposium data');
    }
    
    // Check workshop data for payment status
    if (workshopData && isPaymentVerified(workshopData.payment_status)) {
      consolidatedPaymentStatus = 'paid';
      console.log('Payment verified from workshop data');
    }
    
    // Also check any activities in case they have payment information
    if (symposiumActivities && symposiumActivities.some(activity => isPaymentVerified(activity.payment_status))) {
      consolidatedPaymentStatus = 'paid';
      console.log('Payment verified from symposium activities');
    }
    
    if (workshopActivities && workshopActivities.some(activity => isPaymentVerified(activity.payment_status))) {
      consolidatedPaymentStatus = 'paid';
      console.log('Payment verified from workshop activities');
    }
    
    // Use either symposium or workshop data for participant details
    if (symposiumData) {
      // Use data from symposium view
      formattedParticipant = {
        id: participantId,
        name: symposiumData.participant_name,
        type: symposiumData.participant_type,
        nik: symposiumData.nik,
        email: symposiumData.participant_email,
        phone: symposiumData.participant_phone,
        institution: symposiumData.institution,
        payment_status: consolidatedPaymentStatus, // Use consolidated status
        qr_code: cleanQrCode,
        gates: participantGates
      };
    } else {
      // Use data from workshop view
      formattedParticipant = {
        id: participantId,
        name: workshopData.participant_name,
        type: workshopData.participant_type,
        nik: workshopData.nik,
        email: workshopData.participant_email,
        phone: workshopData.participant_phone,
        institution: workshopData.institution,
        payment_status: consolidatedPaymentStatus, // Use consolidated status
        qr_code: cleanQrCode,
        gates: participantGates
      };
    }
    
    console.log('Successfully constructed participant data with payment_status:', formattedParticipant.payment_status);
    return { data: formattedParticipant };
    
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