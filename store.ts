import { OAuthCredential, User } from "firebase/auth";
import produce from "immer";
import { uniq } from "lodash";
import moment from "moment";
import create from "zustand";
import {
  getOAuthCredentialFromTokens,
  signInAnon,
  signInWithGoogle,
  signOutAsync,
} from "./auth";
import { addDataKey, addDayData, fetchUserData } from "./database";
import { DataKey, DayDate, SignInResult, YearDataMap } from "./types";
import { LOCAL_STORAGE_KEYS } from "./utils/constants";
import { getDateKey } from "./utils/monthGridUtil";

interface StoreState {
  loading: boolean;
  init: () => void;

  dataKeys: DataKey[];
  addDataKey: (dataKeyLabel: string) => void;
  deleteDataKey: (dataKeyId: string) => void;

  yearDataMap: YearDataMap;
  addDayData: (dataKeyId: string, dayDate: DayDate, value: boolean) => void;
  deleteDayData: (dayDataId: string) => void;

  leftScroll: number;
  setLeftScroll: (leftScroll: number) => void;

  idToken: string | null;
  accessToken: string | null;
  user: User | null;
  isAuthed: boolean;
  isAnon: boolean;
  signIn: (anon: boolean) => void;
  signOut: () => void;
  linkAnonymousUser: () => void;

  year: number;
  previousYear: () => void;
  nextYear: () => void;

  showLoginDialog: boolean;
  openLoginDialog: () => void;
  closeLoginDialog: () => void;

  showAddDataKeyDialog: boolean;
  openAddDataKeyDialog: () => void;
  closeAddDataKeyDialog: () => void;

  showDayDataDialog: boolean;
  dayDataDialogDataKeyId: string | null;
  dayDataDialogDayDate: DayDate | null;
  dayDataDialogValue: boolean;
  openDayDataDialog: (
    dataKeyId: string,
    dayDate: DayDate,
    value: boolean
  ) => void;
  closeDayDataDialog: () => void;
}

const useStore = create<StoreState>()((set, get) => ({
  loading: true,
  init: async () => {
    // Try to get the user back from local storage
    const userStr = window.localStorage.getItem(LOCAL_STORAGE_KEYS.USER_KEY);
    let user: User | null = null;
    if (userStr) {
      user = JSON.parse(userStr);
    }

    // Try to get the tokens and oauth credentials from local storage
    let idToken =
      window.localStorage.getItem(LOCAL_STORAGE_KEYS.ID_TOKEN_KEY) || null;
    let accessToken =
      window.localStorage.getItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN_KEY) || null;
    let oAuthCredential: OAuthCredential | null = null;
    if (idToken || accessToken) {
      oAuthCredential = getOAuthCredentialFromTokens(idToken, accessToken);
    }
    if (oAuthCredential?.idToken) {
      idToken = oAuthCredential.idToken || null;
      window.localStorage.setItem(
        LOCAL_STORAGE_KEYS.ID_TOKEN_KEY,
        oAuthCredential.idToken
      );
    }
    if (oAuthCredential?.accessToken) {
      accessToken = oAuthCredential.accessToken || null;
      window.localStorage.setItem(
        LOCAL_STORAGE_KEYS.ACCESS_TOKEN_KEY,
        oAuthCredential.accessToken
      );
    }

    let dataKeys: DataKey[] = [];
    let yearData: { [dataKeyId in string]: string[] } = {};

    if (user?.uid) {
      // If the user exists, fetch user data
      const userData = await fetchUserData(user.uid, get().year);
      dataKeys = userData.dataKeys;

      if (userData.userYearData) {
        yearData = Object.keys(userData.userYearData).reduce((prev, curr) => {
          const dates = userData.userYearData![curr] || {};
          // NOTE: For now, we only care about where days is true
          prev[curr] = uniq(Object.keys(dates));
          return prev;
        }, {} as { [dataKeyId in string]: string[] });
      }
    }

    // Update the state
    set(
      (state) =>
        ({
          loading: false,
          user,
          isAuthed: user != null,
          isAnon: user != null && idToken == null && accessToken == null,
          idToken,
          accessToken,
          dataKeys,
          yearDataMap: {
            ...state.yearDataMap,
            [get().year]: yearData,
          },
        } as StoreState)
    );
  },

  dataKeys: [],
  addDataKey: async (dataKeyLabel: string) => {
    const dataKeyId = await addDataKey(get().user!.uid, dataKeyLabel);

    set((state) => ({
      dataKeys: [...state.dataKeys, { id: dataKeyId, label: dataKeyLabel }],
      showAddDataKeyDialog: false,
    }));
  },
  deleteDataKey: (dataKeyId: string) => {
    // TODO - implement deleting from firebase
  },

  yearDataMap: {},
  addDayData: async (dataKeyId: string, dayDate: DayDate, value: boolean) => {
    await addDayData(get().user!.uid, dataKeyId, dayDate, value);
    set((state) => ({
      yearDataMap: produce(get().yearDataMap, (draft) => {
        if (!draft[get().year]) {
          draft[get().year] = {};
        }

        if (!draft[get().year][dataKeyId]) {
          draft[get().year][dataKeyId] = [];
        }

        if (value) {
          draft[get().year][dataKeyId].push(getDateKey(dayDate));
        } else {
          draft[get().year][dataKeyId] = draft[get().year][dataKeyId].filter(
            (dateKey) => dateKey !== getDateKey(dayDate)
          );
        }
      }),
      showDayDataDialog: false,
      dayDataDialogDataKeyId: null,
      dayDataDialogDayDate: null,
      dayDataDialogValue: false,
    }));
  },
  deleteDayData: (dayDataId: string) => {
    // TODO - implement deleting from firebase
  },

  leftScroll: 0,
  setLeftScroll: (leftScroll: number) =>
    set({ leftScroll } as Partial<StoreState>),

  idToken: null,
  accessToken: null,
  user: null,
  isAuthed: false,
  isAnon: false,
  signIn: async (anon: boolean) => {
    try {
      let result: SignInResult;

      if (anon) {
        result = await signInAnon();
      } else {
        result = await signInWithGoogle();
      }

      localStorage.setItem(
        LOCAL_STORAGE_KEYS.USER_KEY,
        JSON.stringify(result.userCredential.user)
      );
      if (result.oAuthCredential?.idToken) {
        localStorage.setItem(
          LOCAL_STORAGE_KEYS.ID_TOKEN_KEY,
          JSON.stringify(result.oAuthCredential?.idToken)
        );
      }
      if (result.oAuthCredential?.accessToken) {
        localStorage.setItem(
          LOCAL_STORAGE_KEYS.ACCESS_TOKEN_KEY,
          JSON.stringify(result.oAuthCredential?.accessToken)
        );
      }

      set(
        (state) =>
          ({
            idToken: result.oAuthCredential?.idToken || null,
            accessToken: result.oAuthCredential?.accessToken || null,
            user: result.userCredential.user,
            isAuthed: true,
            isAnon: anon,
            showLoginDialog: false,
          } as StoreState)
      );
    } catch (e) {
      console.log(`SIGN IN ERROR: ${JSON.stringify(e)}`);
      // TODO - implement showing error message
    }
  },
  signOut: () => {
    signOutAsync();

    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_KEY);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.ID_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN_KEY);

    set(
      (state) =>
        ({
          idToken: null,
          accessToken: null,
          user: null,
          isAuthed: false,
          isAnon: false,
        } as StoreState)
    );
  },
  linkAnonymousUser: () => {
    if (!get().idToken && !get().accessToken) {
      return;
    }

    const oAuthCredential = getOAuthCredentialFromTokens(
      get().idToken,
      get().accessToken
    );

    if (oAuthCredential.idToken) {
      localStorage.setItem(
        LOCAL_STORAGE_KEYS.ID_TOKEN_KEY,
        JSON.stringify(oAuthCredential.idToken)
      );
    }
    if (oAuthCredential.accessToken) {
      localStorage.setItem(
        LOCAL_STORAGE_KEYS.ACCESS_TOKEN_KEY,
        JSON.stringify(oAuthCredential.accessToken)
      );
    }

    // TODO - update data from anon userId and update dataKey and dataMap
    set(
      (state) =>
        ({
          idToken: oAuthCredential.idToken,
          accessToken: oAuthCredential.accessToken,
          isAuthed: true,
          isAnon: false,
        } as StoreState)
    );
  },

  year: moment().year(),
  previousYear: () => {
    // TODO - fetch data for new year
    set((state) => ({ year: state.year - 1 } as StoreState));
  },
  nextYear: () => {
    // TODO - fetch data for new year
    set((state) => ({ year: state.year + 1 } as StoreState));
  },

  showLoginDialog: false,
  openLoginDialog: () =>
    set((state) => ({ showLoginDialog: true } as StoreState)),
  closeLoginDialog: () =>
    set((state) => ({ showLoginDialog: false } as StoreState)),

  showAddDataKeyDialog: false,
  openAddDataKeyDialog: () =>
    set((state) => ({ showAddDataKeyDialog: true } as StoreState)),
  closeAddDataKeyDialog: () =>
    set((state) => ({ showAddDataKeyDialog: false } as StoreState)),

  showDayDataDialog: false,
  dayDataDialogDataKeyId: null,
  dayDataDialogDayDate: null,
  dayDataDialogValue: false,
  openDayDataDialog: (dataKeyId: string, dayDate: DayDate, value: boolean) => {
    set(
      (state) =>
        ({
          showDayDataDialog: true,
          dayDataDialogDataKeyId: dataKeyId,
          dayDataDialogDayDate: dayDate,
          dayDataDialogValue: value,
        } as StoreState)
    );
  },
  closeDayDataDialog: () => {
    set(
      (state) =>
        ({
          showDayDataDialog: false,
          dayDataDialogDataKeyId: null,
          dayDataDialogDayDate: null,
          dayDataDialogValue: false,
        } as StoreState)
    );
  },
}));

export default useStore;
