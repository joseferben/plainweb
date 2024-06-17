import { renderCode } from "~/app/services/render-code";

export async function HeroSection() {
  const desktopCode = `// routes/signup.tsx

function SignupForm(props: { email?: string, error?: string }) {
  return (
    <form hx-post="/signup">
      <input type="email" name="email" value={props.email} />
      {props.error && <span>{props.error}</span>}
      <button>Subscribe</button>
    </form>
  );
}

export const POST: Handler = async ({ req }) => {
  const parsed = zfd
    .formData({ email: zfd.text().refine((e) => e.includes("@")) })
    .safeParse(req.body);

  if (!parsed.success) {
    return <SignupForm email={parsed.data.email} error="Invalid email" />;
  }

  await database.insert(contacts).values({ email });
  return <div>Thanks for subscribing!</div>;
}

export const GET: Handler = async () => {
  return <SignupForm />;
}`;

  const mobileCode = `// routes/signup.tsx

function SignupForm(props: {
  email?: string;
  error?: string;
}) {
  return (
    <form hx-post="/signup">
      <input
        type="email"
        name="email"
        value={props.email}
      />
      {props.error && <span>{props.error}</span>}
      <button>Subscribe</button>
    </form>
  );
}

export const POST: Handler = async ({ req }) => {
  const parsed = zfd
    .formData({
      email: zfd.text().refine((e) => e.includes("@")),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return (
      <SignupForm
        email={parsed.data.email}
        error="Invalid email"
      />
    );
  }

  await database.insert(contacts).values({ email });
  return <div>Thanks for subscribing!</div>;
};

export const GET: Handler = async () => {
  return <SignupForm />;
};

`;
  const safeDesktopCode = renderCode(desktopCode, "tsx");
  const safeMobileCode = renderCode(mobileCode, "tsx");
  return (
    <div class="mx-auto max-w-4xl pb-24 py-10 sm:pb-32 px-8 mt-20 lg:mt-26">
      <h1 class="text-6xl md:text-8xl font-bold tracking-tight text-neutral text-center">
        plainweb
      </h1>
      <div class="mx-auto max-w-xl">
        <p
          x-data="{}"
          class="mt-10 text-xl leading-8 text-neutral-700 text-center"
        >
          plainweb is a framework using HTMX, SQLite and TypeScript for less
          complexity and more{" "}
          <span
            class="underline cursor-pointer"
            x-on:click="confetti({particleCount: 100, spread: 70, origin: { y: 0.6 }});"
          >
            joy
          </span>{" "}
          🎉
        </p>
      </div>
      <div class="mt-10 text-center">
        <div class="select-all cursor-text rounded-lg bg-slate-200 px-5 py-2.5 inline-block">
          <pre class="text-xl">npx create-plainweb</pre>
        </div>{" "}
      </div>
      <div class="mx-auto mt-20">
        <div class="bg-[#282A36] rounded-lg px-5 py-4 sm:hidden">
          <div class="overflow-x-auto">{safeMobileCode}</div>
        </div>
        <div class="bg-[#282A36] rounded-lg px-5 py-4 hidden sm:block">
          <div class="overflow-x-auto">{safeDesktopCode}</div>
        </div>
        <div class="mt-3">
          <span>
            A file-based route with request handling, form validation, error
            handling and database access.
          </span>
        </div>
      </div>
    </div>
  );
}
