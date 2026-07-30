// WhatsApp OTP Verification Hooks — PocketBase v0.39
// Using the most compatible way to handle request bodies in PB JS hooks.

routerAdd("POST", "/api/whatsapp/send-otp", (e) => {
    let data;
    try {
        // In PB hooks, the body is a buffer. We convert it to string then parse.
        data = JSON.parse(toString(e.request.body));
    } catch (err) {
        return e.json(400, { error: "Invalid JSON body: " + String(err) });
    }
    
    if (!data || !data.phone) {
        return e.json(400, { error: "Phone number is required" });
    }

    const phone = data.phone;
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    if (!globalThis.otpStore) {
        globalThis.otpStore = new Map();
    }
    
    globalThis.otpStore = globalThis.otpStore; // Ensure reference
    globalThis.otpStore.set(phone, {
        otp: otp,
        expiresAt: Date.now() + (5 * 60 * 1000)
    });

    return e.json(200, { 
        success: true, 
        message: "OTP sent to " + phone, 
        debug_otp: otp 
    });
});

routerAdd("POST", "/api/whatsapp/verify-otp", (e) => {
    let data;
    try {
        data = JSON.parse(toString(e.request.body));
    } catch (err) {
        return e.json(400, { error: "Invalid JSON body: " + String(err) });
    }

    if (!data || !data.phone || !data.otp) {
        return e.json(400, { error: "Phone and OTP are required" });
    }

    const { phone, otp } = data;

    if (!globalThis.otpStore) {
        return e.json(200, { verified: false, error: "No active OTP sessions" });
    }

    const session = globalThis.otpStore.get(phone);

    if (!session) {
        return e.json(200, { verified: false, error: "No OTP found for this phone" });
    }

    if (Date.now() > session.expiresAt) {
        globalThis.otpStore.delete(phone);
        return e.json(200, { verified: false, error: "OTP expired" });
    }

    if (session.otp !== otp) {
        return e.json(200, { verified: false, error: "Invalid OTP" });
    }

    globalThis.otpStore.delete(phone);
    return e.json(200, { verified: true });
});
