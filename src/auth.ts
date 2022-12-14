import {
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import app from "./firebase";
import { SignInResult } from "./types";

// The auth provider object
const provider = new GoogleAuthProvider();
provider.addScope("email");
provider.addScope("profile");

// The auth object
const auth = getAuth(app);

/**
 *
 * @returns
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  try {
    const userCredential = await signInWithPopup(auth, provider);
    // This gives you a Google Access Token. You can use it to access the Google API.
    const oAuthCredential =
      GoogleAuthProvider.credentialFromResult(userCredential);

    return {
      userCredential,
      oAuthCredential: oAuthCredential!,
    };
  } catch (e) {
    throw e;
  }
}

/**
 *
 */
export async function signInAnon(): Promise<SignInResult> {
  try {
    const userCredential = await signInAnonymously(auth);
    return {
      userCredential,
      oAuthCredential: null,
    };
  } catch (e) {
    throw e;
  }
}

/**
 *
 */
export async function signOutAsync(): Promise<void> {
  return signOut(auth);
}

/**
 *
 * @param idToken
 * @param accessToken
 * @returns
 */
export function getOAuthCredentialFromTokens(
  idToken?: string | null,
  accessToken?: string | null
) {
  return GoogleAuthProvider.credential(idToken, accessToken);
}
