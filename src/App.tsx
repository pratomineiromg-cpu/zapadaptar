/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { DEFAULT_SETTINGS } from './utils/mockData';
import { generateAutomaticAudienceOptions, generateCustomerCommercialProfiles, DEFAULT_COMMERCIAL_RULES } from './utils/commercialSegmentation';
import {
  Client, ProductDigitalMenu, Cardapio, DeliveryOrder,
  Message,
  HistoryEvent,
  Order,
  Campaign,
  AutomationRule,
  AppSettings,
  FunnelStage,
  Courier,
  DeliveryRoute,
  CourierReview,
  DeliveryHistory,
  CommercialSegment,
  CommercialAudienceOption,
  CampaignTemplate,
  CampaignSchedule,
  CampaignResult,
} from './types';

// Import Views
import { operate } from './lib/commands';
import OrderCenter from './components/OrderCenter';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import WhatsAppView from './components/WhatsAppView';
import CrmKanbanView from './components/CrmKanbanView';
import DailySales from './components/DailySales';
import CardapioView from './components/CardapioView';
import CozinhaView from './components/CozinhaView';
import ProducaoView from './components/ProducaoView';
import GestaoEntregasView from './components/GestaoEntregasView';
import ClientesView from './components/ClientesView';
import AutomationsView from './components/AutomationsView';
import CentralInteligenteView from './components/CentralInteligenteView';
import CommercialIntelligenceView from './components/CommercialIntelligenceView';
import RelatoriosView from './components/RelatoriosView';
import ConfiguracoesView from './components/ConfiguracoesView';
import OrderModal from './components/OrderModal';
import CaixaView from './components/CaixaView';
import { User, CaixaSession } from './types';

import { db, auth as firebaseAuth } from './lib/firebase';
import { signOut } from 'firebase/auth';
import { writeBatch, getDocFromServer, collection, deleteDoc, doc, setDoc, onSnapshot, type DocumentData, type QuerySnapshot } from 'firebase/firestore';

const mapSnapshotWithId = <T,>(snapshot: QuerySnapshot<DocumentData>): T[] =>
  snapshot.docs.map((docSnap) => ({
    ...(docSnap.data() as T),
    id: docSnap.id,
  }));

const normalizeSettings = (rawSettings?: Partial<AppSettings>): AppSettings => {
  const source = rawSettings || {};
  const dailyLimit = source.dailyLimit ?? source.dispatcher?.dailyLimit ?? DEFAULT_SETTINGS.dailyLimit;
  const intervalMin = source.intervalMin ?? source.dispatcher?.intervalMin ?? DEFAULT_SETTINGS.intervalMin;
  const intervalMax = source.intervalMax ?? source.dispatcher?.intervalMax ?? DEFAULT_SETTINGS.intervalMax;
  const autoPause = source.autoPause ?? source.dispatcher?.autoPause ?? DEFAULT_SETTINGS.autoPause;
  const autoPauseAfter = source.autoPauseAfter ?? source.dispatcher?.autoPauseAfter ?? DEFAULT_SETTINGS.autoPauseAfter;
  const waSessionStatus = source.waSessionStatus ?? source.whatsapp?.sessionStatus ?? DEFAULT_SETTINGS.waSessionStatus;
  const operatorRole = source.operatorRole ?? source.ui?.operatorRole ?? DEFAULT_SETTINGS.operatorRole;
  const operatorName = source.operatorName ?? source.ui?.operatorName ?? DEFAULT_SETTINGS.operatorName;
  const theme = source.theme ?? source.ui?.theme ?? DEFAULT_SETTINGS.theme;

  return {
    ...DEFAULT_SETTINGS,
    ...source,
    restaurant: {
      ...DEFAULT_SETTINGS.restaurant,
      ...source.restaurant,
      address: {
        ...DEFAULT_SETTINGS.restaurant.address,
        ...source.restaurant?.address,
      },
      social: {
        ...DEFAULT_SETTINGS.restaurant.social,
        ...source.restaurant?.social,
      },
    },
    operation: {
      ...DEFAULT_SETTINGS.operation,
      ...source.operation,
    },
    delivery: {
      ...DEFAULT_SETTINGS.delivery,
      ...source.delivery,
    },
    cashier: {
      ...DEFAULT_SETTINGS.cashier,
      ...source.cashier,
    },
    whatsapp: {
      ...DEFAULT_SETTINGS.whatsapp,
      ...source.whatsapp,
      sessionStatus: waSessionStatus,
      statusMessages: {
        ...DEFAULT_SETTINGS.whatsapp.statusMessages,
        ...source.whatsapp?.statusMessages,
      },
    },
    dispatcher: {
      ...DEFAULT_SETTINGS.dispatcher,
      ...source.dispatcher,
      dailyLimit,
      intervalMin,
      intervalMax,
      autoPause,
      autoPauseAfter,
    },
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...source.ui,
      theme,
      operatorName,
      operatorRole,
    },
    dailyLimit,
    intervalMin,
    intervalMax,
    autoPause,
    autoPauseAfter,
    waSessionStatus,
    operatorRole,
    operatorName,
    theme,
  };
};

const CURRENT_TAB_STORAGE_KEY = 'lidacomzap_current_tab';

const isSameOperationalDate = (dateValue: string, comparisonDate = new Date()) => {
  const date = new Date(dateValue);
  return (
    date.getFullYear() === comparisonDate.getFullYear() &&
    date.getMonth() === comparisonDate.getMonth() &&
    date.getDate() === comparisonDate.getDate()
  );
};

export default function App({ tenantId, user }: { tenantId: string; user: User }) {
  const auth = { user };
  const manager = ['administrador','administrador_saas','gerente'].includes(user.role);
  const permitted = (tab:string) => manager || (user.role === 'caixa' ? ['caixa','pedidos'].includes(tab) :
    ['dashboard','whatsapp','crm','campanhas','inteligencia_comercial','disparador','pedidos','clientes'].includes(tab));
  const handleLogout = async () => {
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      console.error('ERRO AO SAIR DO FIREBASE AUTH:', error);
    }
  };

  // 1. Core State Managers backed by LocalStorage
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'clients'),
      (snapshot) => {
        const firestoreClients = mapSnapshotWithId<Client>(snapshot);
        const loadedClients = firestoreClients;
        setClients(loadedClients);
        console.log(`FIRESTORE CLIENTS SINCRONIZADOS: ${loadedClients.length}`);
      },
      (error) => {
        console.error('ERRO AO CARREGAR CLIENTS FIRESTORE:', error);
        setClients([]);
      }
    );

    return unsubscribe;
  }, []);

  const [messages, setMessages] = useState<Record<string, Message[]>>({});

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'messages'),
      (snapshot) => {
        const firestoreMessages: Record<string, Message[]> = {};
  
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as {
            clientId?: string;
            items?: Message[];
          };
  
          const clientId = data.clientId || docSnap.id;
  
          firestoreMessages[clientId] = Array.isArray(data.items)
            ? data.items
            : [];
        });
  
        const loadedMessages = firestoreMessages;
  
        setMessages(loadedMessages);
  
        console.log(
          `FIRESTORE MESSAGES SINCRONIZADAS: ${Object.keys(loadedMessages).length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR MESSAGES FIRESTORE:',
          error
        );
  
        setMessages({});
      }
    );
  
    return unsubscribe;
  }, []);
  
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'history'),
      (snapshot) => {
        const firestoreHistory = mapSnapshotWithId<HistoryEvent>(snapshot);
        const loadedHistory = firestoreHistory;
  
        setHistory(loadedHistory);
  
        console.log(`FIRESTORE HISTORY SINCRONIZADO: ${loadedHistory.length}`);
      },
      (error) => {
        console.error('ERRO AO CARREGAR HISTORY FIRESTORE:', error);
        setHistory([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'campaigns'),
      (snapshot) => {
        const firestoreCampaigns = mapSnapshotWithId<Campaign>(snapshot);
        const loadedCampaigns = firestoreCampaigns;
  
        setCampaigns(loadedCampaigns);
  
        console.log(
          `FIRESTORE CAMPAIGNS SINCRONIZADAS: ${loadedCampaigns.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR CAMPAIGNS FIRESTORE:',
          error
        );
  
        setCampaigns([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [commercialSegments, setCommercialSegments] = useState<CommercialSegment[]>([]);

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'commercialSegments'),
      (snapshot) => {
        const firestoreSegments = mapSnapshotWithId<CommercialSegment>(snapshot);
        const loadedSegments = firestoreSegments;

        setCommercialSegments(loadedSegments);

        console.log(
          `FIRESTORE COMMERCIAL SEGMENTS SINCRONIZADAS: ${loadedSegments.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR COMMERCIAL SEGMENTS FIRESTORE:',
          error
        );

        setCommercialSegments([]);
      }
    );

    return unsubscribe;
  }, []);

  const [campaignTemplates, setCampaignTemplates] = useState<CampaignTemplate[]>([]);

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'campaignTemplates'),
      (snapshot) => {
        const firestoreTemplates = mapSnapshotWithId<CampaignTemplate>(snapshot);
        const loadedTemplates = firestoreTemplates;

        setCampaignTemplates(loadedTemplates);

        console.log(
          `FIRESTORE CAMPAIGN TEMPLATES SINCRONIZADOS: ${loadedTemplates.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR CAMPAIGN TEMPLATES FIRESTORE:',
          error
        );

        setCampaignTemplates([]);
      }
    );

    return unsubscribe;
  }, []);

  const [campaignSchedules, setCampaignSchedules] = useState<CampaignSchedule[]>([]);

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'campaignSchedules'),
      (snapshot) => {
        const firestoreSchedules = mapSnapshotWithId<CampaignSchedule>(snapshot);
        const loadedSchedules = firestoreSchedules;

        setCampaignSchedules(loadedSchedules);

        console.log(
          `FIRESTORE CAMPAIGN SCHEDULES SINCRONIZADOS: ${loadedSchedules.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR CAMPAIGN SCHEDULES FIRESTORE:',
          error
        );

        setCampaignSchedules([]);
      }
    );

    return unsubscribe;
  }, []);

  const [campaignResults, setCampaignResults] = useState<CampaignResult[]>([]);

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'campaignResults'),
      (snapshot) => {
        const firestoreResults = mapSnapshotWithId<CampaignResult>(snapshot);
        const loadedResults = firestoreResults;

        setCampaignResults(loadedResults);

        console.log(
          `FIRESTORE CAMPAIGN RESULTS SINCRONIZADOS: ${loadedResults.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR CAMPAIGN RESULTS FIRESTORE:',
          error
        );

        setCampaignResults([]);
      }
    );

    return unsubscribe;
  }, []);
  
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'orders'),
      (snapshot) => {
        const firestoreOrders = mapSnapshotWithId<Order>(snapshot);
        const loadedOrders = firestoreOrders;
  
        setOrders(loadedOrders);
  
        console.log(
          `FIRESTORE ORDERS SINCRONIZADOS: ${loadedOrders.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR ORDERS FIRESTORE:',
          error
        );
  
        setOrders([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [automations, setAutomations] = useState<AutomationRule[]>([]);

  useEffect(() => {
    if (user.role === 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'automations'),
      (snapshot) => {
        const firestoreAutomations = mapSnapshotWithId<AutomationRule>(snapshot);
        const loadedAutomations = firestoreAutomations;
  
        setAutomations(loadedAutomations);
  
        console.log(
          `FIRESTORE AUTOMATIONS SINCRONIZADAS: ${loadedAutomations.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR AUTOMATIONS FIRESTORE:',
          error
        );
  
        setAutomations([]);
      }
    );
  
    return unsubscribe;
  }, []);
  
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'tenants', tenantId, 'settings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setSettings(normalizeSettings(snap.data() as Partial<AppSettings>));
          console.log('FIRESTORE SETTINGS SINCRONIZADO');
        } else {
          setSettings(normalizeSettings(DEFAULT_SETTINGS));
        }
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR SETTINGS FIRESTORE:',
          error
        );
  
        setSettings(normalizeSettings(DEFAULT_SETTINGS));
      }
    );
  
    return unsubscribe;
  }, []);

  const [productsDigitalMenu, setProductsDigitalMenu] = useState<ProductDigitalMenu[]>([]);
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'productsDigitalMenu'),
      (snapshot) => {
        const firestoreProducts = mapSnapshotWithId<any>(snapshot);
        const loadedProducts = firestoreProducts;
  
        setProductsDigitalMenu(loadedProducts);
  
        console.log(
          `FIRESTORE PRODUCTS SINCRONIZADOS: ${loadedProducts.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR PRODUCTS FIRESTORE:',
          error
        );
  
        setProductsDigitalMenu([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [cardapios, setCardapios] = useState<Cardapio[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'cardapios'),
      (snapshot) => {
        const firestoreCardapios = mapSnapshotWithId<any>(snapshot);
        const loadedCardapios = firestoreCardapios;
  
        setCardapios(loadedCardapios);
  
        console.log(
          `FIRESTORE CARDAPIOS SINCRONIZADOS: ${loadedCardapios.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR CARDAPIOS FIRESTORE:',
          error
        );
  
        setCardapios([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'deliveryOrders'),
      (snapshot) => {
        const firestoreDeliveryOrders = mapSnapshotWithId<any>(snapshot);
        const loadedDeliveryOrders = firestoreDeliveryOrders;
  
        setDeliveryOrders(loadedDeliveryOrders);
  
        console.log(
          `FIRESTORE DELIVERY ORDERS SINCRONIZADOS: ${loadedDeliveryOrders.length}`
        );
      },
      (error) => {
        console.error('ERRO AO CARREGAR DELIVERY ORDERS FIRESTORE:', error);
        setDeliveryOrders([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [couriers, setCouriers] = useState<Courier[]>([]);

  useEffect(() => {
    if (!manager) return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'couriers'),
      (snapshot) => {
        const firestoreCouriers = mapSnapshotWithId<Courier>(snapshot);
        const loadedCouriers = firestoreCouriers;
  
        setCouriers(loadedCouriers);
  
        console.log(`FIRESTORE COURIERS SINCRONIZADOS: ${loadedCouriers.length}`);
      },
      (error) => {
        console.error('ERRO AO CARREGAR COURIERS FIRESTORE:', error);
        setCouriers([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);

  useEffect(() => {
    if (!manager) return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'routes'),
      (snapshot) => {
        const firestoreRoutes = mapSnapshotWithId<DeliveryRoute>(snapshot);
        const loadedRoutes = firestoreRoutes;
  
        setRoutes(loadedRoutes);
  
        console.log(`FIRESTORE ROUTES SINCRONIZADAS: ${loadedRoutes.length}`);
      },
      (error) => {
        console.error('ERRO AO CARREGAR ROUTES FIRESTORE:', error);
        setRoutes([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [reviews, setReviews] = useState<CourierReview[]>([]);

  useEffect(() => {
    if (!manager) return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'reviews'),
      (snapshot) => {
        const firestoreReviews = mapSnapshotWithId<CourierReview>(snapshot);
        const loadedReviews = firestoreReviews;
  
        setReviews(loadedReviews);
  
        console.log(`FIRESTORE REVIEWS SINCRONIZADAS: ${loadedReviews.length}`);
      },
      (error) => {
        console.error('ERRO AO CARREGAR REVIEWS FIRESTORE:', error);
        setReviews([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [deliveryHistories, setDeliveryHistories] = useState<DeliveryHistory[]>([]);

  useEffect(() => {
    if (!manager) return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'deliveryHistories'),
      (snapshot) => {
        const firestoreDeliveryHistories = mapSnapshotWithId<DeliveryHistory>(snapshot);
        const loadedDeliveryHistories = firestoreDeliveryHistories;
  
        setDeliveryHistories(loadedDeliveryHistories);
  
        console.log(
          `FIRESTORE DELIVERY HISTORIES SINCRONIZADOS: ${loadedDeliveryHistories.length}`
        );
      },
      (error) => {
        console.error(
          'ERRO AO CARREGAR DELIVERY HISTORIES FIRESTORE:',
          error
        );
  
        setDeliveryHistories([]);
      }
    );
  
    return unsubscribe;
  }, []);

  const [activeCaixaSession, setActiveCaixaSession] = useState<CaixaSession | null>(null);
  const [caixaHistory, setCaixaHistory] = useState<CaixaSession[]>([]);

  useEffect(() => {
    if (!manager && user.role !== 'caixa') return;
    const unsubscribe = onSnapshot(
      collection(db, 'tenants', tenantId, 'caixaSessions'),
      (snapshot) => {
        const firestoreSessions = mapSnapshotWithId<CaixaSession>(snapshot)
          .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

        setCaixaHistory(firestoreSessions);
        setActiveCaixaSession(
          firestoreSessions.find((session) => session.status === 'aberto') || null
        );

        console.log(`FIRESTORE CAIXA SESSIONS SINCRONIZADAS: ${firestoreSessions.length}`);
      },
      (error) => {
        console.error('ERRO AO CARREGAR CAIXA SESSIONS FIRESTORE:', error);
        setCaixaHistory([]);
        setActiveCaixaSession(null);
      }
    );

    return unsubscribe;
  }, []);

  // 2. Navigation & UI controls
  const [currentTab, setCurrentTab] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(CURRENT_TAB_STORAGE_KEY) || 'dashboard';
      return permitted(stored) ? stored : user.role === 'caixa' ? 'caixa' : 'dashboard';
    } catch (error) {
      return 'dashboard';
    }
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Active client details in Chat
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Order modal triggers
  const [clientForOrder, setClientForOrder] = useState<Client | null>(null);

  // Sync to storage on state changes
  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_TAB_STORAGE_KEY, currentTab);
    } catch (error) {
      console.error('ERRO AO SALVAR ABA ATUAL:', error);
    }
  }, [currentTab]);












  const handleUpdateSettings = async (settingsUpdate: Partial<AppSettings>) => {
    const updatedSettings = normalizeSettings({ ...settings, ...settingsUpdate });
    await setDoc(doc(db, 'tenants', tenantId, 'settings', 'default'), updatedSettings);
  };








  // Handle active class settings matching 'dark' theme on DOM root
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await getDocFromServer(doc(db, 'tenants', tenantId, 'settings', 'default'));
      alert('Conexão com a empresa confirmada.');
    } catch { alert('Não foi possível confirmar a conexão.'); }
    finally { setIsSyncing(false); }
  };

// 3. Central History Logger
const handleAddHistoryEvent = (clientId: string, _type: string, title: string, description: string) =>
  operate('note', {clientId,title,description}).catch(showError);
function showError(e: unknown) { alert(e instanceof Error ? e.message : 'Operação não confirmada.'); }

const saveFirestoreDocument = async <T extends { id: string }>(
  collectionName: string,
  item: T,
  logLabel: string
) => {
  try {
    const cleanItem = JSON.parse(JSON.stringify(item));
    await setDoc(doc(db, 'tenants', tenantId, collectionName, item.id), cleanItem, { merge: true });
    console.log(`${logLabel} ATUALIZADO FIRESTORE: ${item.id}`);
  } catch (error) {
    showError(error);
  }
};

const deleteFirestoreDocument = async (
  collectionName: string,
  itemId: string,
  logLabel: string
) => {
  try {
    await deleteDoc(doc(db, 'tenants', tenantId, collectionName, itemId));
    console.log(`${logLabel} REMOVIDO FIRESTORE: ${itemId}`);
  } catch (error) {
    showError(error);
  }
};

const handleSaveSegment = async (segment: CommercialSegment) => {
  await saveFirestoreDocument('commercialSegments', segment, 'COMMERCIAL SEGMENT');
};

const handleDeleteSegment = async (segmentId: string) => {
  await deleteFirestoreDocument('commercialSegments', segmentId, 'COMMERCIAL SEGMENT');
};

const handleSaveTemplate = async (template: CampaignTemplate) => {
  await saveFirestoreDocument('campaignTemplates', template, 'CAMPAIGN TEMPLATE');
};

const handleDeleteTemplate = async (templateId: string) => {
  await deleteFirestoreDocument('campaignTemplates', templateId, 'CAMPAIGN TEMPLATE');
};

const handleSaveCampaign = async (campaign: Campaign) => {
  await saveFirestoreDocument('campaigns', campaign, 'CAMPAIGN');
};

const handleDeleteCampaign = async (campaignId: string) => {
  await deleteFirestoreDocument('campaigns', campaignId, 'CAMPAIGN');
};

const handleSaveSchedule = async (schedule: CampaignSchedule) => {
  await saveFirestoreDocument('campaignSchedules', schedule, 'CAMPAIGN SCHEDULE');
};

const handleDeleteSchedule = async (scheduleId: string) => {
  await deleteFirestoreDocument('campaignSchedules', scheduleId, 'CAMPAIGN SCHEDULE');
};

  // 4. Client modification callback
  const handleUpdateClient = async (updated: Client) => {
    try {
      await setDoc(doc(db, 'tenants', tenantId, 'clients', updated.id), updated, { merge: true });
      if (selectedClient?.id === updated.id) setSelectedClient(updated);
      console.log(`CLIENTE ATUALIZADO FIRESTORE: ${updated.id}`);
    } catch (error) {
      showError(error);
    }
  };

  const handleSendMessage = (clientId: string, text: string, type = 'text') => {
    if (type !== 'text') { alert('Envio de mídia indisponível neste canal.'); return; }
    return operate('draft',{clientId,text}).catch(showError);
  };
  const handleSaveOrderCreated = (order: Order) => operate('operatorOrder',{
    clientId:order.clientId, paymentMethod:order.paymentMethod, notes:order.notes || '',
    expectedTotalCents:Math.round(order.total*100), items:order.items.map(i=>({id:i.id,quantity:i.quantity})),
  }, order.id);

const handleToggleAutomation = async (ruleId: string) => {
  const rule = automations.find(r => r.id === ruleId);
  if (rule) await saveFirestoreDocument('automations', {...rule,active:!rule.active}, 'AUTOMATION');
};
const handleOpenCashier = (initialBalance: number) => operate('cashOpen',{cents:Math.round(initialBalance*100)});
const handleRegisterCaixaTransaction = (type: string,value: number,description: string) =>
  operate('cashMove',{sessionId:activeCaixaSession?.id,type,cents:Math.round(value*100),description});
const handleCloseCashier = (values: {dinheiro:number; cartao:number; pix:number; notaFiado:number; notes:string}) =>
  operate('cashClose',{ sessionId:activeCaixaSession?.id, dinheiro:Math.round(values.dinheiro*100), cartao:Math.round(values.cartao*100), pix:Math.round(values.pix*100), notaFiado:Math.round(values.notaFiado*100), notes:values.notes });
const handleUpdateDeliveryOrders: React.Dispatch<React.SetStateAction<typeof deliveryOrders>> = updater => {
  const next = typeof updater === 'function' ? updater(deliveryOrders) : updater;
  if (next.length !== deliveryOrders.length) { alert('Crie pedidos pelo cardápio público ou pelo atendimento.'); return; }
  for (const order of next) {
    const prior = deliveryOrders.find(row => row.id === order.id);
    if (prior === order) continue;
    if (prior && order.status !== prior.status) operate('prepare',{orderId:order.id,status:order.status}).catch(showError);
    else alert('A edição livre do pedido está indisponível.');
  }
};

  function saveCatalog<T extends {id:string}>(area:string, current:T[], updater:React.SetStateAction<T[]>) {
    const next = typeof updater === 'function' ? updater(current) : updater;
    const batch = writeBatch(db);
    for (const item of next) {
      if (current.find(old=>old.id===item.id) !== item) batch.set(doc(db,'tenants',tenantId,area,item.id),JSON.parse(JSON.stringify(item)),{merge:true});
    }
    for (const item of current) if (!next.some(row=>row.id===item.id)) batch.delete(doc(db,'tenants',tenantId,area,item.id));
    batch.commit().catch(showError);
  }

  const [commercialRules, setCommercialRules] = useState(DEFAULT_COMMERCIAL_RULES);

  const customerCommercialProfiles = useMemo(
    () => generateCustomerCommercialProfiles(clients, orders, deliveryOrders, commercialRules),
    [clients, orders, deliveryOrders, commercialRules]
  );

  const automaticAudienceOptions = useMemo(
    () => generateAutomaticAudienceOptions(customerCommercialProfiles),
    [customerCommercialProfiles]
  );

  const manualAudienceOptions = useMemo<CommercialAudienceOption[]>(
    () => commercialSegments.map((segment) => ({
      id: segment.id,
      name: segment.name,
      description: segment.description,
      source: 'manual',
      dynamic: false,
      active: segment.active,
      customerCount: 0,
      customerIds: [],
    })),
    [commercialSegments]
  );

  const availableAudienceOptions = useMemo(
    () => [...automaticAudienceOptions, ...manualAudienceOptions],
    [automaticAudienceOptions, manualAudienceOptions]
  );

// 7. Calculate overall pipeline value
  const totalPipeline = clients
    .filter((c) => c.stage !== 'Fechado')
    .reduce((v, c) => v + (c.totalBought || 0), 0);

  const formatCurrency = (val: number) => {
    return `R$ ${val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className={`min-h-screen font-sans antialiased text-slate-800 bg-slate-50 dark:bg-slate-950 dark:text-slate-100 flex transition-colors duration-150`}>
      
      {/* 1. Left Sidebar Navigation Panel */}
      <Sidebar
        permitted={permitted}
        currentTab={currentTab}
        onChangeTab={tab=>{if(permitted(tab))setCurrentTab(tab);}}
        settings={settings}
        pipelineValue={formatCurrency(totalPipeline)}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Header Workspace Options */}
        <Header
          settings={settings}
          onUpdateSettings={handleUpdateSettings}

          onToggleMobileMenu={() => setMobileSidebarOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onTriggerSync={handleTriggerSync}
          syncing={isSyncing}
          currentUser={auth.user || undefined}
          onLogout={handleLogout}
        />

        {/* Content Tabs Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
          {currentTab === 'dashboard' && (
            <DashboardView
              clients={clients}
              orders={orders}
              messages={messages}
              onChangeTab={tab=>{if(permitted(tab))setCurrentTab(tab);}}
              onSelectClientInChat={setSelectedClient}
            />
          )}

          {currentTab === 'caixa' && (<>
            <OrderCenter orders={orders} deliveries={deliveryOrders} onReceive={(orderId,evidence) => operate('receive',{orderId,evidence,sessionId:activeCaixaSession?.id})} />
            <CaixaView
              activeSession={activeCaixaSession}
              lastClosedSession={caixaHistory.find((session) => session.status === 'fechado') || null}
              currentUser={auth.user}
              onOpenCashier={handleOpenCashier}
              onRegisterTransaction={handleRegisterCaixaTransaction}
              onCloseCashier={handleCloseCashier}
            /></>
          )}

          {currentTab === 'whatsapp' && (
            <WhatsAppView
              history={history}
              clients={clients}
              messages={messages}
              onSendMessage={handleSendMessage}
              onUpdateClient={handleUpdateClient}
              onAddHistoryEvent={(id, type, head, desc) => handleAddHistoryEvent(id, type, head, desc)}
              selectedClient={selectedClient}
              onSelectClient={setSelectedClient}
              onOpenOrderModal={setClientForOrder}
            />
          )}

          {currentTab === 'crm' && (
            <CrmKanbanView
              clients={clients}
              onUpdateClient={handleUpdateClient}
              onAddHistoryEvent={handleAddHistoryEvent}
              onChangeTab={tab=>{if(permitted(tab))setCurrentTab(tab);}}
              onSelectClientInChat={setSelectedClient}
            />
          )}

          {(currentTab === 'campanhas' || currentTab === 'inteligencia_comercial') && (
            <CommercialIntelligenceView
            key={currentTab}
            initialTab={currentTab === 'campanhas' ? 'campaigns' : 'dashboard'}
            commercialSegments={commercialSegments}
            availableAudienceOptions={availableAudienceOptions}
            clients={clients}
            settings={settings}
            campaignTemplates={campaignTemplates}
            campaigns={campaigns}
            campaignSchedules={campaignSchedules}
            campaignResults={campaignResults}
            customerCommercialProfiles={customerCommercialProfiles}
            rules={commercialRules}
            onSaveRules={setCommercialRules}
            onSaveSegment={handleSaveSegment}
            onDeleteSegment={handleDeleteSegment}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onSaveCampaign={handleSaveCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onSaveSchedule={handleSaveSchedule}
            onDeleteSchedule={handleDeleteSchedule}
        />
          )}
          {currentTab === 'disparador' && (
            <DailySales clients={clients} />
          )}

          {currentTab === 'cardapio' && (
            <CardapioView
              tenantId={tenantId}
              clients={clients}
              onUpdateClient={handleUpdateClient}
              onAddHistoryEvent={handleAddHistoryEvent}
              onSendMessage={handleSendMessage}
              cardapios={cardapios}
              setCardapios={updater=>saveCatalog('cardapios',cardapios,updater)}
              products={productsDigitalMenu}
              setProducts={updater=>saveCatalog('productsDigitalMenu',productsDigitalMenu,updater)}
              deliveryOrders={deliveryOrders}
              setDeliveryOrders={handleUpdateDeliveryOrders}
/>
)}

{currentTab === 'cozinha' && (
            <CozinhaView
              clients={clients}
              onUpdateClient={handleUpdateClient}
              onAddHistoryEvent={handleAddHistoryEvent}
              onSendMessage={handleSendMessage}
              deliveryOrders={deliveryOrders}
              setDeliveryOrders={handleUpdateDeliveryOrders}
              products={productsDigitalMenu}
              setProducts={setProductsDigitalMenu}
            />
          )}

          {currentTab === 'producao' && (
            <ProducaoView
              deliveryOrders={deliveryOrders}
              setDeliveryOrders={handleUpdateDeliveryOrders}
            />
          )}

{currentTab === 'gestao_entregas' && (
  <GestaoEntregasView
    couriers={couriers}
    setCouriers={(updater:React.SetStateAction<Courier[]>)=>saveCatalog('couriers',couriers,updater)}
    reviews={reviews}
    setReviews={setReviews}
    routes={routes}
    setRoutes={setRoutes}
    messages={messages}
    setMessages={setMessages}
    deliveryOrders={deliveryOrders}
    setDeliveryOrders={handleUpdateDeliveryOrders}
  />
)}

          

          

          

          {currentTab === 'pedidos' && <OrderCenter orders={orders} deliveries={deliveryOrders} />}
          {currentTab === 'clientes' && (
            <ClientesView
              clients={clients}
              onUpdateClient={handleUpdateClient}
              onAddHistoryEvent={handleAddHistoryEvent}
            />
          )}

          {currentTab === 'automations' && (
            <AutomationsView
              rules={automations}
              onToggleRule={handleToggleAutomation}
            />
          )}

          {currentTab === 'central' && (
            <CentralInteligenteView
              clients={clients}
              orders={orders}
            />
          )}

          {currentTab === 'relatorios' && (
            <RelatoriosView
              clients={clients}
              orders={orders}
              campaigns={campaigns}
            />
          )}

          {currentTab === 'configuracoes' && (
            <ConfiguracoesView
              settings={settings}
              onUpdateSettings={handleUpdateSettings}


            />
          )}
        </main>
      </div>

      {/* 3. ABSOLUTE GLOBAL OVERLAYS: billing generation modal inside conversation workspace */}
      {clientForOrder && (
        <OrderModal
          products={productsDigitalMenu}
          client={clientForOrder}
          onClose={() => setClientForOrder(null)}
          onSaveOrder={handleSaveOrderCreated}
        />
      )}

    </div>
  );
}
