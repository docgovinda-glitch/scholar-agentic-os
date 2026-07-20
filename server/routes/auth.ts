import express from "express";
import crypto from "crypto";

import {
  loginBruteForceLimit,
  authModerateLimit,
  authModeratePerUserLimit,
  authQueryPerUserLimit,
} from "../middleware/authRateLimiter.js";
import { readUsersDb, writeUsersDb } from "../services/userDb.js";
import { encryptServerKey } from "../utils/apiKeyCrypto.js";

const router = express.Router();

// Check Approval Status
router.get("/api/check-approval", authModerateLimit, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: "Missing username parameter." });
    }
    const db = readUsersDb();
    const userRec = db.find((u) => u.username === (username as string).trim());
    if (!userRec) {
      // If user is not in users.json but exists in localStorage, return true to avoid locking out existing dev profiles
      return res.status(200).json({ is_approved: true });
    }
    return res.status(200).json({ is_approved: userRec.is_approved });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server Error" });
  }
});

// Request Password Reset Handler
router.post("/api/request-password-reset", authModerateLimit, async (req, res) => {
  try {
    const { username, email, newPasswordHash } = req.body;
    if (!username || !email || !newPasswordHash) {
      return res.status(400).json({ error: "Missing required fields for password reset request." });
    }

    const db = readUsersDb();
    let userRec = db.find((u) => u.username === username.trim());

    if (!userRec) {
      userRec = {
        username: username.trim(),
        fullName: username.trim(),
        email: email.trim(),
        phone: "",
        affiliation: "Unknown",
        authenticId: "None",
        is_approved: false,
        activationKeyHash: "",
      };
      db.push(userRec);
    }

    userRec.tempPasscodeHash = newPasswordHash;
    userRec.resetApproved = false;
    writeUsersDb(db);

    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = "doc.govinda@gmail.com";
    const host = req.headers.host || "localhost:3000";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const approveResetUrl = `${protocol}://${host}/api/approve-reset?user=${encodeURIComponent(
      username.trim()
    )}&email=${encodeURIComponent(email.trim())}`;

    let emailSent = false;
    let errorDetails = "";

    if (apiKey) {
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D1CEC7; border-radius: 12px; background-color: #FAF8F5; color: #1A365D;">
          <h2 style="font-family: serif; font-style: italic; color: #1A365D; border-bottom: 1px solid #D1CEC7; padding-bottom: 10px;">Scholar Password Reset Approval Request</h2>
          <p>A password reset has been requested for scholar: <strong>${username}</strong> (${email}).</p>
          <p>Please click the button below to approve this password reset:</p>
          <p align="center" style="margin: 24px 0;">
            <a href="${approveResetUrl}" style="background-color: #C08A3E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              Approve Reset Password
            </a>
          </p>
        </div>
      `;

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: "Scholar Agentic <onboarding@resend.dev>",
            to: adminEmail,
            subject: `[Password Reset Request] Scholar Identity: ${username}`,
            html: emailHtml,
          }),
        });

        if (response.ok) {
          emailSent = true;
        } else {
          errorDetails = await response.text();
        }
      } catch (err: any) {
        errorDetails = err.message;
      }
    }

    return res.status(200).json({
      success: true,
      emailSent,
      requiresClientEmail: !emailSent,
      approveResetUrl,
      msg: emailSent
        ? "Password reset request sent to admin."
        : `Admin email notification fallback: ${errorDetails || "Resend not configured."}`,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server Error" });
  }
});

// Approve Password Reset Handler
router.get("/api/approve-reset", authQueryPerUserLimit, async (req, res) => {
  try {
    const { user, email } = req.query;
    if (!user || !email) {
      return res.status(400).send("<h3>Missing approval details.</h3>");
    }

    const db = readUsersDb();
    const userRec = db.find((u) => u.username === (user as string).trim());

    if (!userRec || !userRec.tempPasscodeHash) {
      return res.status(404).send("<h3>No pending password reset request found for this scholar.</h3>");
    }

    userRec.passcodeHash = userRec.tempPasscodeHash;
    delete userRec.tempPasscodeHash;
    userRec.resetApproved = true;
    userRec.is_approved = true;
    writeUsersDb(db);

    const apiKey = process.env.RESEND_API_KEY;
    let emailSent = false;

    if (apiKey) {
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #D1CEC7; border-radius: 12px; background-color: #FAF8F5; color: #1A365D;">
          <h2 style="font-family: serif; font-style: italic; color: #1A365D; border-bottom: 1px solid #D1CEC7; padding-bottom: 10px;">Scholar Password Reset Approved</h2>
          <p>Hello Scholar,</p>
          <p>Your request to reset your password for the <strong>Scholar Agentic</strong> workspace has been approved by the Administrator.</p>
          <p>You may now log in using your new password credential.</p>
        </div>
      `;

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: "Scholar Agentic <onboarding@resend.dev>",
            to: email as string,
            subject: "Your Password Reset Request Has Been Approved",
            html: emailHtml,
          }),
        });
        emailSent = true;
      } catch (err) {
        console.error("Failed to notify user of reset approval:", err);
      }
    }

    res.status(200).send(`
      <div style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 40px; border: 1px solid #D1CEC7; border-radius: 24px; background-color: #FAF8F5; text-align: center; color: #1A365D; box-shadow: 0 12px 30px rgba(26,54,93,0.06);">
        <h2 style="font-family: serif; font-style: italic; color: #C08A3E;">Password Reset Request Approved!</h2>
        <p>The password reset request for scholar <strong>${user}</strong> has been successfully approved.</p>
        <p style="font-size: 13px; color: #6B665E;">
          An automated notification email has been dispatched to <strong>${email}</strong>.
        </p>
      </div>
    `);
  } catch (err: any) {
    console.error(err);
    res.status(500).send("<h3>Internal Server Error</h3>");
  }
});

// Scholar Registration OTP/Access Request Handler
router.post("/api/register", authModeratePerUserLimit, async (req, res) => {
  try {
    const { username, fullName, email, phone, affiliation, authenticId, otp } = req.body;

    if (otp) {
      if (!email) {
        return res.status(400).json({ error: "Missing email address for OTP dispatch." });
      }

      const apiKey = process.env.RESEND_API_KEY;
      let emailSent = false;
      let errorDetails = "";

      if (apiKey) {
        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D1CEC7; border-radius: 12px; background-color: #FAF8F5; color: #1A365D;">
            <h2 style="font-family: serif; font-style: italic; color: #1A365D; border-bottom: 1px solid #D1CEC7; padding-bottom: 10px;">Scholar OS Email Verification</h2>
            <p>Hello,</p>
            <p>Thank you for registering a Scholar Identity with <strong>Scholar Agentic OS</strong>.</p>
            <p>Your 6-digit email verification OTP code is:</p>
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; padding: 15px; margin: 20px 0; background-color: #1A365D; color: white; border-radius: 8px;">
              ${otp}
            </div>
            <p>Please enter this code in the registration screen to verify your email address and unlock your workspace.</p>
            <p style="font-size: 11px; color: #6B665E; margin-top: 30px; border-top: 1px solid #E2E8F0; padding-top: 10px;">
              This code was requested for the registration of username: <strong>${username || "New Scholar"}</strong>.
            </p>
          </div>
        `;

        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              from: "Scholar Agentic <onboarding@resend.dev>",
              to: email,
              subject: `[Verification Code] Scholar Registration OTP`,
              html: emailHtml,
            }),
          });

          if (response.ok) {
            emailSent = true;
          } else {
            const errText = await response.text();
            errorDetails = `Resend Error: ${errText}`;
          }
        } catch (err: any) {
          errorDetails = err.message || "Network error sending email";
        }
      }

      if (emailSent) {
        return res.status(200).json({ success: true, emailSent: true });
      }

      return res.status(200).json({
        success: true,
        emailSent: false,
        requiresClientEmail: true,
        msg: apiKey ? `Resend failed: ${errorDetails}` : "Resend not configured on server.",
      });
    }

    if (!username || !fullName || !email || !affiliation) {
      return res.status(400).json({ error: "Missing required registration fields." });
    }

    const db = readUsersDb();
    let userRec = db.find((u) => u.username === username.trim());
    if (userRec) {
      if (userRec.is_approved) {
        return res.status(400).json({ error: "Scholar username is already registered and approved." });
      }
    } else {
      userRec = {
        username: username.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone || "",
        affiliation: affiliation.trim(),
        authenticId: authenticId || "None",
        is_approved: false,
        activationKeyHash: "",
      };
      db.push(userRec);
    }

    const activationKey = `SA-${Math.floor(100000 + Math.random() * 900000)}`;
    const activationKeyHash = crypto.createHash("sha256").update(activationKey).digest("hex");

    userRec.activationKeyHash = activationKeyHash;
    writeUsersDb(db);

    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = "doc.govinda@gmail.com";
    const host = req.headers.host || "localhost:3000";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";

    const approveUrl = `${protocol}://${host}/api/approve?user=${encodeURIComponent(
      username.trim()
    )}&email=${encodeURIComponent(email.trim())}&key=${activationKey}`;

    let emailSent = false;
    let errorDetails = "";

    if (apiKey) {
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D1CEC7; border-radius: 12px; background-color: #FAF8F5; color: #1A365D;">
          <h2 style="font-family: serif; font-style: italic; color: #1A365D; border-bottom: 1px solid #D1CEC7; padding-bottom: 10px;">Scholar Access Request</h2>
          <p>A new researcher has requested access to the <strong>Scholar Agentic</strong> workspace.</p>
          <table border="1" cellpadding="8" style="width: 100%; border-collapse: collapse; border-color: #D1CEC7; background-color: white; border-radius: 8px; overflow: hidden;">
            <tr style="background-color: #1A365D; color: white;">
              <th align="left">Field</th>
              <th align="left">Details</th>
            </tr>
            <tr><td><strong>Scholar Username</strong></td><td>${username}</td></tr>
            <tr><td><strong>Full Name</strong></td><td>${fullName}</td></tr>
            <tr><td><strong>Email Address</strong></td><td>${email}</td></tr>
            <tr><td><strong>Phone Number</strong></td><td>${phone || "None"}</td></tr>
            <tr><td><strong>Affiliation / University</strong></td><td>${affiliation}</td></tr>
            <tr><td><strong>Authentic ID Type/No.</strong></td><td>${authenticId || "None"}</td></tr>
          </table>
          <br/>
          <p>If you approve this scholar, click the button below to automatically email them their Activation Key:</p>
          <p align="center" style="margin: 24px 0;">
            <a href="${approveUrl}" style="background-color: #C08A3E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              Approve & Email Key
            </a>
          </p>
          <p style="font-size: 11px; color: #6B665E;">
            Manual Activation Key backup: <strong>${activationKey}</strong>
          </p>
        </div>
      `;

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: "Scholar Agentic <onboarding@resend.dev>",
            to: adminEmail,
            subject: `[Access Request] Scholar Identity: ${username}`,
            html: emailHtml,
          }),
        });

        if (response.ok) {
          emailSent = true;
        } else {
          const errText = await response.text();
          errorDetails = `Resend Error: ${errText}`;
        }
      } catch (err: any) {
        errorDetails = err.message || "Network error sending email";
      }
    }

    if (emailSent) {
      return res.status(200).json({
        success: true,
        activationKeyHash,
        emailSent: true,
        msg: "Access request sent to admin.",
      });
    }

    return res.status(200).json({
      success: true,
      activationKeyHash,
      emailSent: false,
      requiresClientEmail: true,
      activationKey,
      approveUrl,
      msg: apiKey ? `Resend failed: ${errorDetails}. Falling back to browser-side dispatch.` : "Resend not configured. Dispatching email client-side.",
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// Verify and Sync Profile Handler (Checks password + approval state on server)
router.post("/api/verify-and-sync-profile", loginBruteForceLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Missing required login fields." });
    }

    const db = readUsersDb();
    const userRec = db.find((u) => u.username === username.trim());
    if (!userRec) {
      // If user is not in server users.json database yet, return success: true to avoid locking out pre-existing local storage profiles
      return res.status(200).json({ success: true, is_approved: true });
    }

    if (!userRec.is_approved) {
      return res.status(200).json({ success: false, is_approved: false, error: "Awaiting Admin Approval" });
    }

    // Verify passcodeHash if configured
    if (userRec.passcodeHash && userRec.passcodeHash !== password) {
      return res.status(400).json({ success: false, error: "Incorrect password credentials." });
    }

    // Return current profile details
    return res.status(200).json({
      success: true,
      is_approved: true,
      fullName: userRec.fullName,
      email: userRec.email,
      phone: userRec.phone,
      affiliation: userRec.affiliation,
      authenticId: userRec.authenticId,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server Error" });
  }
});

// Request Profile Update Handler
router.post("/api/request-profile-update", async (req, res) => {
  try {
    const {
      username,
      pendingEmail,
      pendingPhone,
      pendingFullName,
      pendingAffiliation,
      pendingAuthenticId,
      pendingIdDocumentName,
    } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    // Generate random 6-digit key (e.g., UP-381920)
    const verificationKey = `UP-${Math.floor(100000 + Math.random() * 900000)}`;
    const keyHash = crypto.createHash("sha256").update(verificationKey).digest("hex");

    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = "doc.govinda@gmail.com";
    const host = req.headers.host || "scholar-agentic.vercel.app";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";

    const approveUrl = `${protocol}://${host}/api/approve-profile-update?user=${encodeURIComponent(
      username
    )}&email=${encodeURIComponent(pendingEmail || "")}&phone=${encodeURIComponent(
      pendingPhone || ""
    )}&key=${verificationKey}`;

    let emailSent = false;
    let errorDetails = "";

    if (apiKey) {
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D1CEC7; border-radius: 12px; background-color: #FAF8F5; color: #1A365D;">
          <h2 style="font-family: serif; font-style: italic; color: #1A365D; border-bottom: 1px solid #D1CEC7; padding-bottom: 10px;">Scholar Profile Update Request</h2>
          <p>Scholar <strong>${username}</strong> has requested to update their profile details.</p>
          <table border="1" cellpadding="8" style="width: 100%; border-collapse: collapse; border-color: #D1CEC7; background-color: white; border-radius: 8px; overflow: hidden;">
            <tr style="background-color: #1A365D; color: white;">
              <th align="left">Field</th>
              <th align="left">Requested Value</th>
            </tr>
            ${pendingFullName ? `<tr><td><strong>New Full Name</strong></td><td>${pendingFullName}</td></tr>` : ""}
            ${pendingEmail ? `<tr><td><strong>New Email</strong></td><td>${pendingEmail}</td></tr>` : ""}
            ${pendingPhone ? `<tr><td><strong>New WhatsApp Number</strong></td><td>${pendingPhone}</td></tr>` : ""}
            ${pendingAffiliation ? `<tr><td><strong>New Affiliation</strong></td><td>${pendingAffiliation}</td></tr>` : ""}
            ${pendingAuthenticId ? `<tr><td><strong>New Authentic ID</strong></td><td>${pendingAuthenticId}</td></tr>` : ""}
            ${pendingIdDocumentName ? `<tr><td><strong>Uploaded Identification</strong></td><td>${pendingIdDocumentName}</td></tr>` : ""}
          </table>
          <br/>
          <p>If you approve these changes, click the button below to approve and email the scholar their Update Verification Key:</p>
          <p align="center" style="margin: 24px 0;">
            <a href="${approveUrl}" style="background-color: #C08A3E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              Approve Profile Update
            </a>
          </p>
          <p style="font-size: 11px; color: #6B665E;">
            Manual Update Key backup: <strong>${verificationKey}</strong>
          </p>
        </div>
      `;

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: "Scholar Agentic <onboarding@resend.dev>",
            to: adminEmail,
            subject: `[Profile Update Request] Scholar: ${username}`,
            html: emailHtml,
          }),
        });

        if (response.ok) {
          emailSent = true;
        } else {
          const errText = await response.text();
          errorDetails = `Resend Error: ${errText}`;
        }
      } catch (err: any) {
        errorDetails = err.message || "Network error sending email";
      }
    }

    return res.status(200).json({
      success: true,
      keyHash,
      emailSent,
      verificationKey, // bypass for local testing
      approveUrl,
      msg: emailSent
        ? "Update request sent to admin."
        : `Resend not configured on server. Please use bypass key: ${verificationKey}`,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server Error" });
  }
});

// Profile Update Approval Page Handler
router.get("/api/approve-profile-update", async (req, res) => {
  const { user, email, phone, key } = req.query;

  if (!user || !key) {
    return res.status(400).send(`
      <div style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 30px; border: 1px solid #E2B6B6; border-radius: 16px; background-color: #FAF1F1; text-align: center; color: #9C2E2E;">
        <h2>Error: Missing approval parameters.</h2>
        <p>Ensure the URL contains the user and verification key details.</p>
      </div>
    `);
  }

  // Pre-fill the mailto link parameters
  const mailtoSubject = encodeURIComponent("Your Scholar Agentic Profile Update Approved");
  const mailtoBody = encodeURIComponent(
    `Hello Scholar,\n\n` +
      `Your request to update your Scholar Agentic profile details has been approved!\n\n` +
      `Please enter the following Update Verification Key in your profile settings to apply the changes:\n\n` +
      `Update Verification Key: ${key}\n\n` +
      `Best regards,\n` +
      `Scholar Agentic Administrator`
  );

  const targetNotifyEmail = (email as string) || "doc.govinda@gmail.com";
  const mailtoUrl = `mailto:${targetNotifyEmail}?subject=${mailtoSubject}&body=${mailtoBody}`;

  res.setHeader("Content-Type", "text/html");
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Profile Update Approved | Workspace Admin</title>
        <style>
          body {
            background-color: #FAF8F5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            color: #1A365D;
            padding: 20px;
            box-sizing: border-box;
          }
          .card {
            max-width: 500px;
            width: 100%;
            background: white;
            border: 1px solid #D1CEC7;
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 12px 30px rgba(26,54,93,0.06);
          }
          .icon {
            font-size: 52px;
            margin-bottom: 20px;
            display: inline-block;
          }
          h1 {
            font-family: Georgia, serif;
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 10px 0;
            color: #1A365D;
          }
          p {
            font-size: 14px;
            color: #6B665E;
            line-height: 1.6;
            margin: 0 0 24px 0;
          }
          .key-box {
            font-size: 22px;
            font-weight: bold;
            font-family: monospace;
            color: #C08A3E;
            letter-spacing: 2px;
            background: #FAF8F5;
            padding: 12px 24px;
            border: 1px dashed #D1CEC7;
            border-radius: 8px;
            display: inline-block;
            margin-bottom: 24px;
          }
          .btn {
            background-color: #1A365D;
            color: white;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 12px;
            font-weight: bold;
            font-size: 14px;
            display: inline-block;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(26,54,93,0.15);
            border: none;
            cursor: pointer;
          }
          .btn:hover {
            background-color: #122847;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(26,54,93,0.2);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>Update Approved</h1>
          <p>The profile update request for scholar <strong>${user}</strong> has been successfully approved.</p>
          <div class="key-box">${key}</div>
          <p>Please send this Verification Key to the scholar so they can complete the update in their settings panel.</p>
          <a href="${mailtoUrl}" class="btn">Email Key to Scholar</a>
        </div>
      </body>
    </html>
  `);
});

// Save Model Preferences Endpoint
router.post("/api/save-model-preferences", async (req, res) => {
  try {
    const { username, preferences } = req.body;
    if (!username || !preferences) {
      return res.status(400).json({ error: "Missing username or preferences." });
    }

    const db = readUsersDb();
    const userRec = db.find((u) => u.username === username.trim());
    if (!userRec) {
      return res.status(404).json({ error: "Scholar profile not found." });
    }

    userRec.modelPreferences = preferences;
    writeUsersDb(db);

    return res.status(200).json({ success: true, message: "Model preferences saved successfully." });
  } catch (err: any) {
    console.error("Failed to save model preferences:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// Save Encrypted API Keys Endpoint
router.post("/api/save-api-keys", authModeratePerUserLimit, async (req, res) => {
  try {
    const { username, apiKeys } = req.body;
    if (!username || !apiKeys) {
      return res.status(400).json({ error: "Missing username or apiKeys." });
    }

    const db = readUsersDb();
    const userRec = db.find((u) => u.username === username.trim());
    if (!userRec) {
      return res.status(404).json({ error: "Scholar profile not found." });
    }

    if (!userRec.encryptedApiKeys) userRec.encryptedApiKeys = {};
    if (!userRec.apiKeyHashes) userRec.apiKeyHashes = {};

    for (const provider of Object.keys(apiKeys)) {
      const plainKey = apiKeys[provider];
      if (!plainKey) {
        delete userRec.encryptedApiKeys[provider];
        delete userRec.apiKeyHashes[provider];
      } else {
        const keyHash = crypto.createHash("sha256").update(plainKey).digest("hex");
        userRec.apiKeyHashes[provider] = keyHash;
        userRec.encryptedApiKeys[provider] = encryptServerKey(plainKey);
      }
    }

    writeUsersDb(db);
    return res.status(200).json({ success: true, message: "API credentials stored securely on server." });
  } catch (err: any) {
    console.error("Failed to store API credentials:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// Admin Approval Page Handler
router.get("/api/approve", async (req, res) => {
  const { user, email, key } = req.query;

  if (!user || !email || !key) {
    return res.status(400).send(`
      <div style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 30px; border: 1px solid #E2B6B6; border-radius: 16px; background-color: #FAF1F1; text-align: center; color: #9C2E2E;">
        <h2>Error: Missing approval parameters.</h2>
        <p>Ensure the URL contains the user, email, and key details.</p>
      </div>
    `);
  }

  const db = readUsersDb();
  const userRec = db.find((u) => u.username === (user as string).trim());
  if (userRec) {
    userRec.is_approved = true;
    writeUsersDb(db);
  }

  const apiKey = process.env.RESEND_API_KEY;
  let autoEmailSent = false;
  let autoEmailError = "";

  if (apiKey) {
    const userEmailHtml = `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #D1CEC7; border-radius: 12px; background-color: #FAF8F5; color: #1A365D;">
        <h2 style="font-family: serif; font-style: italic; color: #1A365D; border-bottom: 1px solid #D1CEC7; padding-bottom: 10px;">Scholar Workspace Approved</h2>
        <p>Hello Scholar,</p>
        <p>Your registration request for the <strong>Scholar Agentic</strong> research workspace has been approved by the Administrator.</p>
        <p>Please enter the following Activation Key in your login portal to unlock your workspace:</p>
        <p align="center" style="margin: 24px 0;">
          <span style="font-size: 24px; font-weight: bold; font-family: monospace; color: #C08A3E; letter-spacing: 2px; background: white; padding: 12px 24px; border: 1px dashed #D1CEC7; border-radius: 8px; display: inline-block;">
            ${key}
          </span>
        </p>
        <p>Welcome to the workspace! You can now access research agents, compile manuscripts, and manage citations.</p>
        <p style="font-size: 11px; color: #8C887F; border-top: 1px solid #D1CEC7; padding-top: 10px; margin-top: 20px;">
          Secure local profile storage active. This key unlocks your device's cached credentials.
        </p>
      </div>
    `;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: "Scholar Agentic <onboarding@resend.dev>",
          to: email as string,
          subject: "Your Scholar Workspace Has Been Approved!",
          html: userEmailHtml,
        }),
      });
      if (response.ok) {
        autoEmailSent = true;
      } else {
        autoEmailError = await response.text();
      }
    } catch (err: any) {
      console.error("Failed to send email to scholar:", err);
      autoEmailError = err.message || "Network error sending email via Resend";
    }
  }

  // Pre-fill the mailto link parameters
  const mailtoSubject = encodeURIComponent("Your Scholar Agentic Workspace Approval Key");
  const mailtoBody = encodeURIComponent(
    `Hello Scholar,\n\n` +
      `Your registration request for the Scholar Agentic AI-Powered Research Workspace has been approved!\n\n` +
      `Please enter the following Activation Key in your login portal to unlock your workspace:\n\n` +
      `Activation Key: ${key}\n\n` +
      `Welcome to the workspace! You can now access research agents, compile manuscripts, and manage citations.\n\n` +
      `Best regards,\n` +
      `Scholar Agentic Administrator`
  );
  const mailtoUrl = `mailto:${email}?subject=${mailtoSubject}&body=${mailtoBody}`;

  res.setHeader("Content-Type", "text/html");
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Scholar Approved | Workspace Admin</title>
        <style>
          body {
            background-color: #FAF8F5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            color: #1A365D;
            padding: 20px;
            box-sizing: border-box;
          }
          .card {
            max-width: 500px;
            width: 100%;
            background: white;
            border: 1px solid #D1CEC7;
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 12px 30px rgba(26,54,93,0.06);
            animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .icon {
            font-size: 52px;
            margin-bottom: 20px;
            display: inline-block;
            animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.15s both;
          }
          h2 {
            font-family: Georgia, serif;
            font-style: italic;
            margin-top: 0;
            font-size: 26px;
            font-weight: 500;
            color: #1A365D;
          }
          p {
            font-size: 14px;
            color: #5C564E;
            line-height: 1.6;
            margin: 8px 0 16px 0;
          }
          .details-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 13px;
            border: 1px solid #FAF8F5;
            border-radius: 12px;
            overflow: hidden;
          }
          .details-table td {
            padding: 10px 14px;
            border: 1px solid #EAE7DF;
            text-align: left;
          }
          .details-table td.label {
            font-weight: bold;
            color: #6B665E;
            background: #FAF8F5;
            width: 35%;
          }
          .code-box {
            position: relative;
            background: #FAF8F5;
            border: 1px dashed #C08A3E;
            border-radius: 12px;
            padding: 18px;
            margin: 24px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
          }
          .code {
            font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
            font-size: 24px;
            color: #C08A3E;
            font-weight: bold;
            letter-spacing: 2px;
          }
          .copy-btn {
            background: white;
            border: 1px solid #D1CEC7;
            padding: 6px 12px;
            font-size: 11px;
            border-radius: 6px;
            color: #1A365D;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.2s ease;
          }
          .copy-btn:hover {
            border-color: #1A365D;
            background: #FAF8F5;
          }
          .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            border-radius: 100px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 24px;
          }
          .status-badge.success {
            background-color: #E6F6ED;
            color: #137333;
            border: 1px solid #C2E7D9;
          }
          .status-badge.warning {
            background-color: #FEF3D6;
            color: #B06000;
            border: 1px solid #FCE2A6;
          }
          .actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 24px;
          }
          .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 24px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s ease;
            box-sizing: border-box;
          }
          .btn-primary {
            background: #1A365D;
            color: white;
            border: none;
            box-shadow: 0 4px 12px rgba(26,54,93,0.15);
          }
          .btn-primary:hover {
            background: #122847;
            box-shadow: 0 6px 16px rgba(26,54,93,0.22);
            transform: translateY(-1px);
          }
          .btn-secondary {
            background: white;
            color: #1A365D;
            border: 1px solid #D1CEC7;
          }
          .btn-secondary:hover {
            border-color: #1A365D;
            background: #FAF8F5;
          }
          .footer {
            font-size: 11px;
            color: #8C887F;
            margin-top: 35px;
            border-top: 1px solid #EAE7DF;
            padding-top: 20px;
          }
          .tooltip {
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%) translateY(-8px);
            background: #1A365D;
            color: white;
            padding: 4px 8px;
            font-size: 10px;
            border-radius: 4px;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
            white-space: nowrap;
          }
          .tooltip.show {
            opacity: 1;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes scaleIn {
            from { transform: scale(0.6); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🎓</div>
          <h2>Scholar Approved</h2>
          
          \${
            autoEmailSent
              ? \`<div class="status-badge success">✓ Automated Email Dispatched</div>\`
              : \`<div class="status-badge warning">⚠ Manual Email Dispatch Advised</div>\`
          }
          
          <p>The researcher profile for <strong>\${user}</strong> has been verified and approved.</p>
          
          <table class="details-table">
            <tr>
              <td class="label">Scholar Username</td>
              <td>\${user}</td>
            </tr>
            <tr>
              <td class="label">Scholar Email</td>
              <td>\${email}</td>
            </tr>
          </table>

          <p style="font-size: 12px; margin-top: 15px;">Copy the activation key to send it to the scholar:</p>
          <div class="code-box">
            <span class="code" id="key-text">\${key}</span>
            <button class="copy-btn" onclick="copyKey()" id="copy-btn-el">Copy Key</button>
            <div class="tooltip" id="tooltip-el">Copied!</div>
          </div>

          <div class="actions">
            <a href="\${mailtoUrl}" class="btn btn-primary" id="mailto-btn">
              ✉ Open Mail Client & Send Key
            </a>
            <button class="btn btn-secondary" onclick="copyTemplate()">
              📋 Copy Pre-formatted Email Text
            </button>
          </div>

          <div class="footer">
            Scholar Agentic Workspace • Secure Academic Gateway
          </div>
        </div>

        <script>
          const key = "\${key}";
          const email = "\${email}";
          const user = "\${user}";
          
          function copyKey() {
            navigator.clipboard.writeText(key).then(() => {
              const tooltip = document.getElementById("tooltip-el");
              tooltip.classList.add("show");
              setTimeout(() => {
                tooltip.classList.remove("show");
              }, 1500);
            });
          }

          function copyTemplate() {
            const templateText = 
              \\\`Hello Scholar,\\\\n\\\\n\\\` +
              \\\`Your registration request for the Scholar Agentic AI-Powered Research Workspace has been approved!\\\\n\\\\n\\\` +
              \\\`Please enter the following Activation Key in your login portal to unlock your workspace:\\\\n\\\\n\\\` +
              \\\`Activation Key: \\\${key}\\\\n\\\\n\\\` +
              \\\`Welcome to the workspace! You can now access research agents, compile manuscripts, and manage citations.\\\\n\\\\n\\\` +
              \\\`Best regards,\\\\n\\\\n\\\` +
              \\\`Scholar Agentic Administrator\\\`;
            
            navigator.clipboard.writeText(templateText).then(() => {
              alert("Pre-formatted email body copied to clipboard! You can now paste it directly into your email client.");
            });
          }
        </script>
      </body>
    </html>
  `);
});

// Save Model Preferences Endpoint
// (already defined above)

export default router;

