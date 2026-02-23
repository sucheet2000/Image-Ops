import Link from "next/link";
import { GoogleAuthPanel } from "../components/google-auth";

export const metadata = {
  title: "Login | Image Ops",
  description: "Sign in with Google to use protected Image Ops APIs."
};

export default function LoginPage() {
  return (
    <main className="container">
      <h1>Login</h1>
      <p className="subhead">Use your Google account to create a secure Image Ops API session.</p>
      <GoogleAuthPanel />
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
