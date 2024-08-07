import { FeatureSection } from "app/components/feature-section";
import { FooterSection } from "app/components/footer-section";
import { HeroSection } from "app/components/hero-section";
import { SignupSection } from "app/components/signup-section";
import type { Database } from "app/config/database";
import { env } from "app/config/env";
import Layout from "app/layout";
import { createContact } from "app/services/contacts";
import type express from "express";
import type { Handler } from "plainweb";
import { zfd } from "zod-form-data";

async function validateTurnstile(req: express.Request, token: string) {
  const ip = req.header("CF-Connecting-IP");
  const formData = new FormData();
  formData.append("secret", env.CF_TURNSTILE_SECRET);
  formData.append("response", token);
  formData.append("remoteip", ip || "");
  const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const result = await fetch(url, {
    body: formData,
    method: "POST",
  });

  const outcome = await result.json();
  if (!outcome.success) {
    console.error("Turnstile error", outcome);
    return false;
  }
  return true;
}

export const POST: Handler = async ({ req, res }) => {
  const database = res.locals.database as Database;
  const parsed = zfd
    .formData({
      "cf-turnstile-response": zfd.text(),
      email: zfd.text().refine((e) => e.includes("@")),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return (
      <div class="mt-10 text-xl text-error">
        Please provide a valid email address
      </div>
    );
  }
  const isHuman = await validateTurnstile(
    req,
    parsed.data["cf-turnstile-response"],
  );
  if (!isHuman) {
    return (
      <div class="mt-10 text-xl text-error">
        An error occurred. Please try again later.
      </div>
    );
  }

  try {
    await createContact(database, parsed.data.email);
    return (
      <div class="mt-10 text-xl text-neutral-700">
        Thanks for subscribing, check your inbox.
      </div>
    );
  } catch (e) {
    console.error(e);
    return (
      <div class="mt-10 text-xl text-error">
        An error occurred. Please try again later.
      </div>
    );
  }
};

export const GET: Handler = async () => {
  return (
    <Layout
      head={
        <>
          <script
            defer
            src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"
          />
          <script defer src="/public/confetti.js" />
        </>
      }
    >
      <HeroSection />
      <FeatureSection />
      <SignupSection />
      <FooterSection />
    </Layout>
  );
};
