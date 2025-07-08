CREATE OR REPLACE FUNCTION public.perform_check_in(p_qr_code text, p_gate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant_id uuid;
    v_registration_id uuid;
    v_registration_item_id uuid;
    v_registration_status text;
    v_gate_type text;
    v_admin_id uuid := auth.uid();
    v_is_eligible boolean := false;
    v_already_checked_in boolean := false;
    v_participant_info record;
BEGIN
    -- 1. Find participant and registration from QR code
    SELECT participant_id, registration_id INTO v_participant_id, v_registration_id
    FROM public.participant_qr_codes
    WHERE qr_code_id = p_qr_code;

    IF v_participant_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Invalid QR Code');
    END IF;

    -- 2. Check registration status (must be 'paid')
    SELECT status INTO v_registration_status
    FROM public.registrations
    WHERE id = v_registration_id;

    IF v_registration_status <> 'paid' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Registration not paid');
    END IF;

    -- 3. Determine gate type (symposium or workshop)
    IF EXISTS (SELECT 1 FROM public.tickets WHERE id = p_gate_id AND includes_symposium = true) THEN
        v_gate_type := 'symposium';
    ELSIF EXISTS (SELECT 1 FROM public.workshops WHERE id = p_gate_id) THEN
        v_gate_type := 'workshop';
    ELSE
        RETURN jsonb_build_object('status', 'error', 'message', 'Invalid gate ID');
    END IF;

    -- 4. Check participant eligibility for the gate and get registration_item_id
    IF v_gate_type = 'symposium' THEN
        SELECT ri.id, true INTO v_registration_item_id, v_is_eligible
        FROM public.registration_items ri
        JOIN public.tickets t ON ri.ticket_id = t.id
        WHERE ri.participant_id = v_participant_id
          AND ri.parent_registration_id = v_registration_id
          AND t.includes_symposium = true
          AND t.id = p_gate_id;

    ELSIF v_gate_type = 'workshop' THEN
        SELECT true INTO v_is_eligible
        FROM public.participant_workshops
        WHERE participant_id = v_participant_id
          AND workshop_id = p_gate_id;
        
        -- Find a relevant registration_item_id for the check_in record.
        -- This assumes the participant has at least one main registration item.
        SELECT id INTO v_registration_item_id
        FROM public.registration_items
        WHERE participant_id = v_participant_id
          AND parent_registration_id = v_registration_id
        LIMIT 1;
    END IF;

    IF NOT v_is_eligible OR v_registration_item_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Participant not registered for this event');
    END IF;

    -- 5. Check if already checked in
    IF v_gate_type = 'symposium' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.check_ins
            WHERE registration_item_id = v_registration_item_id AND workshop_id IS NULL
        ) INTO v_already_checked_in;
    ELSE -- workshop
        SELECT EXISTS (
            SELECT 1 FROM public.check_ins
            WHERE registration_item_id = v_registration_item_id AND workshop_id = p_gate_id
        ) INTO v_already_checked_in;
    END IF;

    IF v_already_checked_in THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Participant already checked in');
    END IF;

    -- 6. Perform check-in
    INSERT INTO public.check_ins (registration_item_id, workshop_id, checked_in_by)
    VALUES (v_registration_item_id, CASE WHEN v_gate_type = 'workshop' THEN p_gate_id ELSE NULL END, v_admin_id);

    -- 7. Return success with participant details
    SELECT p.full_name, p.institution, p.participant_type, r.registration_number
    INTO v_participant_info
    FROM public.participants p
    JOIN public.registrations r ON p.registration_id = r.id
    WHERE p.id = v_participant_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'message', 'Check-in successful',
        'data', jsonb_build_object(
            'full_name', v_participant_info.full_name,
            'institution', v_participant_info.institution,
            'participant_type', v_participant_info.participant_type,
            'registration_number', v_participant_info.registration_number
        )
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'An unexpected error occurred: ' || SQLERRM);
END;
$$;
