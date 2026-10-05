import { ShieldCheck } from 'lucide-react'

export const accountSecurity = {
  id: 'ACCOUNT_SECURITY',
  label: 'Account & Security',
  description: 'Passwords, sign-in and the email on your account.',
  icon: ShieldCheck,
  issues: [
    {
      slug: 'forgot-password',
      label: 'Forgot Password',
      problems: [
        {
          slug: 'no-password',
          label: 'I forgot my password',
          summary: 'Forgot the account password',
          description:
            'You are signed in or trying to sign in, but you cannot remember the password you chose.',
          steps: [
            'Open the sign-in page and select "Forgot password".',
            'Enter the email address you registered with.',
            'Follow the link in the reset email to choose a new password.',
          ],
          action: { label: 'Reset your password', to: '/forgot-password' },
        },
        {
          slug: 'reset-email-missing',
          label: 'Reset email never arrived',
          summary: 'Password reset email was not received',
          description:
            'The reset request went through, but no email is arriving in your inbox.',
          steps: [
            'Check your spam or junk folder — automated mail is often filed there.',
            'Confirm you entered the same email address you registered with.',
            'Wait a couple of minutes and request the email again.',
            'Ask your mail provider to allow emails from Taskora while you wait.',
          ],
          action: { label: 'Resend reset email', to: '/forgot-password' },
        },
        {
          slug: 'reset-link-expired',
          label: 'Reset link expired',
          summary: 'Password reset link has expired',
          description:
            'The link in the reset email no longer works. Reset links are deliberately short-lived.',
          steps: [
            'Request a fresh reset email — the old link cannot be reactivated.',
            'Open the newest email and use its link within the hour.',
            'Check that your device clock is correct; a skewed clock is the usual cause of an instant expiry.',
          ],
          action: { label: 'Request a new link', to: '/forgot-password' },
        },
        {
          slug: 'no-email-access',
          label: 'I no longer have access to my email',
          summary: 'No longer has access to the registered email',
          description:
            'The account is tied to an email address you can no longer open, so the usual reset route is closed.',
          steps: [
            'Try signing in with any provider you linked to the account — a Google or Apple sign-in still works without the email inbox.',
            'If you signed up with a password, contact support so the account can be verified another way.',
          ],
        },
      ],
    },
    {
      slug: 'lost-account-access',
      label: "Lost / Can't Access Account",
      problems: [
        {
          slug: 'locked-out',
          label: 'Locked out after too many attempts',
          summary: 'Locked out after repeated failed sign-in attempts',
          description:
            'Repeated failed attempts pause sign-in for a short period as a safeguard.',
          steps: [
            'Wait 15 minutes before trying again.',
            'Reset your password if you are not sure of the current one.',
            'Make sure you are on the correct sign-in page for your account.',
          ],
          action: { label: 'Reset your password', to: '/forgot-password' },
        },
        {
          slug: 'account-not-found',
          label: 'Account not found',
          summary: 'Sign-in reports the account does not exist',
          description:
            'The email address on the sign-in form does not match an account on Taskora.',
          steps: [
            'Check for a typo in the email address.',
            'Try the address you use for other services — it is often a different one.',
            'If you signed up with Google or Apple, use that button instead of the email form.',
          ],
        },
        {
          slug: 'suspended-account',
          label: 'My account was suspended',
          summary: 'Account suspended and cannot be signed in to',
          description:
            'An administrator has suspended the account. Suspended accounts keep all of their data.',
          steps: [
            'Read the notification email for the reason given.',
            'Reply to that email to appeal the decision.',
          ],
        },
      ],
    },
    {
      slug: 'login-problems',
      label: 'Login Problems',
      problems: [
        {
          slug: 'stay-signed-out',
          label: 'Signed out repeatedly',
          summary: 'Repeatedly signed out of the session',
          description:
            'The session is ending sooner than expected, so you are sent back to the sign-in page.',
          steps: [
            'Turn off "Remember me" is not the fix — instead check whether a browser extension is clearing cookies for this site.',
            'If you are on a shared or managed device, an administrator may be enforcing a session timeout.',
            'Sign in again and check the box to stay signed in.',
          ],
        },
        {
          slug: 'wrong-credentials',
          label: 'Email or password rejected',
          summary: 'Sign-in rejected the email or password',
          description: 'The credentials entered did not match an account.',
          steps: [
            'Check that caps lock is off and the email has no stray spaces.',
            'Confirm you are signing in to Taskora and not a saved account from another service.',
            'Reset the password if you are certain the email is correct.',
          ],
          action: { label: 'Reset your password', to: '/forgot-password' },
        },
        {
          slug: 'sso-fails',
          label: 'Google or Apple sign-in fails',
          summary: 'Social sign-in fails or does not return to Taskora',
          description:
            'The provider sign-in completes but Taskora does not receive the account, usually because a different Taskora account already uses that email.',
          steps: [
            'Finish signing in with the provider first, then return and try again.',
            'If you previously registered with a password, sign in that way and change your email instead.',
            'Check that cookies are allowed for this site on the device.',
          ],
        },
      ],
    },
    {
      slug: 'change-email',
      label: 'Change Email',
      problems: [
        {
          slug: 'change-email-code-missing',
          label: 'Confirmation code never arrived',
          summary: 'Email change confirmation code was not received',
          description:
            'Taskora sent a code to the new address to prove you own it, and it has not arrived.',
          steps: [
            'Check the spam folder in the NEW mailbox as well as the old one.',
            'Confirm the new address was typed correctly — the code goes only to the address you entered.',
            'Wait a minute and request a new code.',
          ],
        },
        {
          slug: 'change-email-blocked',
          label: 'Email already in use',
          summary: 'Requested email address is already linked to an account',
          description:
            'Each email address can belong to one Taskora account only, so it cannot be claimed twice.',
          steps: [
            'Sign in with the account that already uses that email to check which one it is.',
            'If that other account is not yours, contact support so it can be investigated.',
          ],
        },
        {
          slug: 'change-email-wrong',
          label: 'Changed to the wrong address',
          summary: 'Account email was changed to the wrong address',
          description:
            'The account email now points somewhere you did not intend.',
          steps: [
            'If you can still sign in, change it back from Settings.',
            'If the new address is inaccessible, use the password reset route from the sign-in page.',
          ],
          action: { label: 'Go to Settings', to: '/settings' },
        },
      ],
    },
  ],
}
