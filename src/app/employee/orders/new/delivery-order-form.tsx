"use client";
import { limitJordanPhoneInput,normalizeJordanPhone } from "@/lib/customers/customer-phone";
import { privateBottlePlan } from "@/lib/customers/private-bottle-plan";
import { deliveryPaymentPlan } from "@/lib/orders/payment-plan";
import { userMessage } from "@/lib/client/user-message";
import { customerDeliveryUnitPrice } from "@/lib/customers/delivery-pricing";
import { newRequestId } from "@/lib/client/request-id";

import ActionModal from "@/components/ui/action-modal";
import { CustomerBottleReminder } from "@/components/store/customer-bottle-reminder";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type { ProductCategory } from "@/types/product";

import styles from "./delivery-order.module.css";

type DeliveryProduct = {
  bottleSizeMl?: number;
  id: string;
  name: string;
  category: ProductCategory;
  deliveryPriceFils: number;
  requiresBottleOrigin: boolean;
};

type BottleOrigin = "JORDANIAN" | "SAUDI";

type BottleOriginCounts = Record<BottleOrigin, number>;

type SelectedOrderItem = {
  personalBottleQuantity?: number;
  lineKey: string;
  productId: string;
  name: string;
  quantity: number;
  deliveryPriceFils: number;
  bottleOrigin: BottleOrigin | null;
};

function needsBottleOrigin(product: DeliveryProduct) {
  return product.category === "REFILL" &&
    product.requiresBottleOrigin;
}

type PaymentMethod = "CASH" | "CLICK" | "COUPON";

type Props = {
  products: DeliveryProduct[];
  mode?: "admin" | "employee";
};

type CustomerChoice = {
  id: string;
  name: string;
  phone: string;
  primaryAddress: string;
  specialDelivery20LPriceFils?: number | null;
};

function apiError(data: unknown, fallback: string): string {
  if (
    data && typeof data === "object" &&
    "error" in data && data.error &&
    typeof data.error === "object" &&
    "message" in data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }
  return fallback;
}


type IconName =
  | "arrow"
  | "phone"
  | "user"
  | "pin"
  | "search"
  | "basket"
  | "ticket"
  | "cash"
  | "click"
  | "check"
  | "truck"
  | "box"
  | "info"
  | "trash"
  | "spark"
  | "receipt"
  | "note"
  | "shield"
  | "clock"
  | "plus"
  | "minus"
  | "book";

function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const drawings: Record<IconName, ReactNode> = {
    arrow: (
      <>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </>
    ),
    phone: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 5.18 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.72l.5 3a2 2 0 0 1-.57 1.72L8 11a16 16 0 0 0 5 5l1.56-1.93a2 2 0 0 1 1.72-.57l3 .5A2 2 0 0 1 22 16.92Z" />
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    basket: (
      <>
        <path d="M3 9h18l-2 11H5L3 9Z" />
        <path d="m8 9 4-6 4 6" />
        <path d="M9 13v3M15 13v3" />
      </>
    ),
    ticket: (
      <>
        <path d="M3 8V5h18v3a4 4 0 0 0 0 8v3H3v-3a4 4 0 0 0 0-8Z" />
        <path d="M12 5v2m0 4v2m0 4v2" />
      </>
    ),
    cash: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M5 9h2m10 6h2" />
      </>
    ),
    click: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M10 5h4m-2 13h.01" />
      </>
    ),
    check: (
      <path d="m5 12 4 4L19 6" />
    ),
    truck: (
      <>
        <path d="M3 5h11v12H3V5Zm11 4h4l3 4v4h-7V9Z" />
        <circle cx="7.5" cy="18" r="2" />
        <circle cx="17.5" cy="18" r="2" />
      </>
    ),
    box: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" />
        <path d="m3 7 9 5 9-5M12 12v10" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 11v6m0-10h.01" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18m-2 0-1 15H6L5 6m3 0V3h8v3" />
        <path d="M10 10v7m4-7v7" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3L12 2Z" />
      </>
    ),
    receipt: (
      <>
        <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6m-6 4h3" />
      </>
    ),
    note: (
      <>
        <path d="M4 4h16v16H4V4Z" />
        <path d="M8 9h8M8 13h8m-8 4h5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 2 21 6v6c0 5-3.5 8.5-9 10-5.5-1.5-9-5-9-10V6l9-4Z" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    plus: (
      <path d="M12 5v14M5 12h14" />
    ),
    minus: (
      <path d="M5 12h14" />
    ),
    book: (
      <>
        <path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Z" />
        <path d="M12 5v15" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {drawings[name]}
    </svg>
  );
}

const categoryOptions: Array<{
  value: "ALL" | ProductCategory;
  label: string;
}> = [
  { value: "REFILL", label: "تعبئة" },
  { value: "CUPS", label: "أكواب" },
  { value: "NEW_BOTTLE", label: "قوارير" },
  { value: "SHRINK", label: "شرنك" },
  { value: "COOLED", label: "مبرد" },
  { value: "OTHER", label: "أخرى" },
  { value: "ALL", label: "الكل" },
];

const paymentOptions: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    value: "CASH",
    label: "كاش",
    description: "دفع نقدي",
    icon: "cash",
  },
  {
    value: "CLICK",
    label: "كليك",
    description: "تحويل إلكتروني",
    icon: "click",
  },
  {
    value: "COUPON",
    label: "كوبونات",
    description: "قوارير المياه",
    icon: "ticket",
  },
];

const quickNotes = [
  "الاتصال قبل الوصول",
  "التسليم عند الباب",
  "يرجى التأكد من العنوان",
];

function formatMoney(fils: number) {
  return `${(fils / 1000).toFixed(3)} د.أ`;
}

function getPaymentLabel(method: PaymentMethod) {
  return (
    paymentOptions.find(
      (option) => option.value === method,
    )?.label ?? "غير محدد"
  );
}

export default function DeliveryOrderForm({
  products: initialProducts, mode="employee",
}: Props) {
  const router = useRouter();
  const customerEndpoint=mode==="admin"?"/api/admin/order-customers":"/api/operator/customers";
  const orderEndpoint=mode==="admin"?"/api/admin/delivery-orders/create":"/api/operator/delivery-orders";

  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] =
    useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [matches, setMatches] = useState<CustomerChoice[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerChoice | null>(null);
  const products=useMemo(()=>initialProducts.map(product=>({...product,deliveryPriceFils:customerDeliveryUnitPrice(product,selectedCustomer??{}).unitPriceFils})),[initialProducts,selectedCustomer]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [savedOrder, setSavedOrder] = useState<{
    orderNumber: string;
    paymentState: string;
    pendingCouponQuantity: number;
  } | null>(null);
  const [confirmedShortages,setConfirmedShortages]=useState<Record<string,string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const paymentTouched = useRef(false);
  const [remainderMethod,setRemainderMethod]=useState<"CASH"|"CLICK">("CASH");
  const requestIdRef = useRef<string | null>(null);
  const prefilledRef = useRef(false);

  // Preselect only a public customer record from the protected operator API.
  // Fetch only protected account totals for the employee, never its history.
  const [account,setAccount]=useState<{id:string;moneyDueFils:number;couponsDue:number;availableCoupons:number;partial:boolean;privateBottles?:Array<{origin:string;sizeMl:number;owned:number;reserved:number}>}|null>(null);
  const [accountError,setAccountError]=useState("");
  const [accountRevision,setAccountRevision]=useState(0);
  useEffect(()=>{
    if(!selectedCustomer) return;
    const id=selectedCustomer.id, controller=new AbortController();
    const endpoint=mode==="admin" ? "/api/admin/customers/"+encodeURIComponent(id)+"/receivables" : "/api/operator/customer-account?customerId="+encodeURIComponent(id);
    fetch(endpoint,{cache:"no-store",signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok||!result.success) throw Error(result.error?.message??"تعذّر تحميل رصيد العميل.");if(!controller.signal.aborted){setAccount({...result.data,id});if(!paymentTouched.current)setPaymentMethod(result.data.availableCoupons>0?"COUPON":"CASH");setAccountError("");}}).catch(error=>{if(!controller.signal.aborted){setAccountError(error instanceof Error?error.message:"تعذّر تحميل الرصيد.");setAccount(null);}});
    return ()=>controller.abort();
  },[selectedCustomer,mode,accountRevision]);
  useEffect(() => {
    if (prefilledRef.current) return;
    prefilledRef.current = true;
    const customerId = new URLSearchParams(window.location.search).get("customerId");
    if (!customerId || !/^[a-zA-Z0-9_-]{1,128}$/.test(customerId)) return;
    const controller = new AbortController();
    async function prefill() {
      try {
        const response = await fetch(`${customerEndpoint}?id=${encodeURIComponent(customerId!)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data.success || !data.data?.customers?.[0]) {
          throw new Error("تعذر جلب بيانات العميل. ابحث عنه يدويًا.");
        }
        if (controller.signal.aborted) return;
        const customer = data.data.customers[0] as CustomerChoice;
        setConfirmedShortages({});
    paymentTouched.current=false;
    setPaymentMethod("CASH");
    setAccount(null);
    setSelectedCustomer(customer);
        setPhone(customer.phone);
        setCustomerName(customer.name);
        setAddress(customer.primaryAddress);
      } catch {
        if (!controller.signal.aborted) setCustomerError(userMessage("تعذر اختيار العميل تلقائيًا. ابحث عنه بالاسم أو الهاتف."));
      }
    }
    void prefill();
    return () => controller.abort();
  }, [customerEndpoint]);

  useEffect(() => {
    if (selectedCustomer || customerQuery.trim().length < 2) {
      return;
    }
    const abortController = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const response = await fetch(
          `${customerEndpoint}?q=${encodeURIComponent(customerQuery.trim())}`,
          { signal: abortController.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok || data.success !== true) {
          throw new Error(apiError(data, "تعذر البحث عن العملاء."));
        }
        setMatches(data.data?.customers ?? []);
        setCustomerError("");
      } catch (error) {
        if (!abortController.signal.aborted) {
          setMatches([]);
          setCustomerError(userMessage(error instanceof Error ? error.message : "تعذر البحث عن العملاء."));
        }
      } finally {
        if (!abortController.signal.aborted) setSearchingCustomers(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [customerQuery, selectedCustomer, customerEndpoint]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<
    "ALL" | ProductCategory
  >("REFILL");

  const [cart, setCart] = useState<
    Record<string, number>
  >({});
  const [confirmClearCart, setConfirmClearCart] = useState(false);

  // Only products configured for bottle origin
  // use these two independent quantities.
  const [bottleOrigins, setBottleOrigins] = useState<
    Record<string, BottleOriginCounts>
  >({});


  const [
    newBookletRequested,
    setNewBookletRequested,
  ] = useState(false);

  const availableCategories = useMemo(() => {
    const existing = new Set(
      products.map((product) => product.category),
    );

    return categoryOptions.filter(
      (option) =>
        option.value === "ALL" ||
        existing.has(option.value),
    );
  }, [products]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        category === "ALL" ||
        product.category === category;

      const matchesSearch =
        product.name.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, category]);

  const selectedProducts = useMemo(
    () =>
      products.flatMap((product): SelectedOrderItem[] => {
        if (needsBottleOrigin(product)) {
          const originCounts = bottleOrigins[product.id];
          const result: SelectedOrderItem[] = [];

          for (const origin of [
            "JORDANIAN",
            "SAUDI",
          ] as const) {
            const quantity = originCounts?.[origin] ?? 0;

            if (quantity > 0) {
              result.push({
                lineKey: `${product.id}:${origin}`,
                productId: product.id,
                name: `${product.name} — ${
                  origin === "JORDANIAN" ? "أردني" : "سعودي"
                }`,
                quantity,
                deliveryPriceFils: product.deliveryPriceFils,
                bottleOrigin: origin,
              });
            }
          }

          return result;
        }

        const quantity = cart[product.id] ?? 0;

        if (quantity === 0) {
          return [];
        }

        return [{
          lineKey: product.id,
          productId: product.id,
          name: product.name,
          quantity,
          deliveryPriceFils: product.deliveryPriceFils,
          bottleOrigin: null,
        }];
      }),
    [products, cart, bottleOrigins],
  );

  const privateLines=selectedProducts.map(item=>({category:products.find(p=>p.id===item.productId)!.category,quantity:item.quantity,bottleOrigin:item.bottleOrigin,bottleSizeMl:products.find(p=>p.id===item.productId)?.bottleSizeMl??20000}));
  const ownershipRows=account?.id===selectedCustomer?.id?account?.privateBottles??[]:[];
  const privateUsage=privateBottlePlan(privateLines,ownershipRows as Parameters<typeof privateBottlePlan>[1]);
  const shortages=selectedProducts.flatMap((item,index)=>privateUsage[index].shortage>0?[{...item,...privateUsage[index]}]:[]);
  const shortageKey=(line:typeof shortages[number])=>[line.quantity,line.personalBottleQuantity,line.shortage].join(":");
  const allShortagesConfirmed=shortages.every(line=>confirmedShortages[line.lineKey]===shortageKey(line));
  const paymentPlan=deliveryPaymentPlan(selectedProducts.map(item=>({category:products.find(p=>p.id===item.productId)!.category,quantity:item.quantity,unitPriceFils:item.deliveryPriceFils})),account?.id===selectedCustomer?.id?account?.availableCoupons??0:0,paymentMethod==="COUPON");
  const itemCount = selectedProducts.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const productsTotalFils =
    selectedProducts.reduce(
      (total, item) =>
        total +
        item.deliveryPriceFils * item.quantity,
      0,
    );

  const phoneValid = normalizeJordanPhone(phone)!==null;

  const customerReady =
    selectedCustomer !== null &&
    phoneValid &&
    customerName.trim().length >= 2 &&
    address.trim().length >= 5;

  const productsReady = itemCount > 0;

  const currentStep = !customerReady
    ? 0
    : !productsReady
      ? 1
      : 2;

  const steps: Array<{
    number: string;
    title: string;
    description: string;
    target: string;
    icon: IconName;
  }> = [
    {
      number: "01",
      title: "بيانات العميل",
      description: "التواصل والعنوان",
      target: "customer-section",
      icon: "user",
    },
    {
      number: "02",
      title: "المنتجات",
      description: "الأصناف والكميات",
      target: "products-section",
      icon: "basket",
    },
    {
      number: "03",
      title: "الدفع والتأكيد",
      description: "الطريقة والملاحظات",
      target: "payment-section",
      icon: "receipt",
    },
  ];

  function chooseCustomer(customer: CustomerChoice) {
    setConfirmedShortages({});paymentTouched.current=false;setPaymentMethod("CASH");setAccount(null);setAccountError("");
    setSelectedCustomer(customer);
    setPhone(customer.phone);
    setCustomerName(customer.name);
    setAddress(customer.primaryAddress);
    setCustomerQuery("");
    setMatches([]);
    setSearchingCustomers(false);
    setCustomerError("");
    setOrderError("");
  }

  function switchCustomer() {
    setConfirmedShortages({});paymentTouched.current=false;setPaymentMethod("CASH");setAccount(null);setAccountError("");
    setSelectedCustomer(null);
    setPhone("");
    setCustomerName("");
    setAddress("");
    setCustomerQuery("");
    setMatches([]);
    setOrderError("");
  }

  async function createNewCustomer() {
    setCustomerError("");
    if (!normalizeJordanPhone(phone) || customerName.trim().length < 2 || address.trim().length < 5) {
      setCustomerError(userMessage("أدخل رقم هاتف صحيحًا واسمًا وعنوانًا كاملين."));
      return;
    }
    setCreatingCustomer(true);
    try {
      const response = await fetch(customerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customerName.trim(), phone, primaryAddress: address.trim() }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(apiError(data, "تعذر إنشاء العميل."));
      }
      chooseCustomer(data.data.customer);
    } catch (error) {
      setCustomerError(userMessage(error instanceof Error ? error.message : "تعذر إنشاء العميل."));
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function saveOrder() {
    setOrderError("");
    if (!selectedCustomer || !customerReady || itemCount === 0 || !allShortagesConfirmed) {
      setOrderError(userMessage("اختر العميل، وأكمل العنوان، وأضف المنتجات أولًا."));
      return;
    }
    setSavingOrder(true);
    try {
      if (!requestIdRef.current) requestIdRef.current = newRequestId();
      const response = await fetch(orderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestIdRef.current,
          expectedTotalFils: productsTotalFils,
          customerId: selectedCustomer.id,
          address: address.trim(),
          notes: notes.trim(),
          paymentMethod,
          remainderMethod,
          expectedCouponQuantity: paymentMethod==="COUPON" ? paymentPlan.couponQuantity : 0,
          newBookletRequested,
          items: selectedProducts.map((item,index) => ({
            productId: item.productId,
            quantity: item.quantity,
            bottleOrigin: item.bottleOrigin,
            personalBottleQuantity: privateUsage[index].personalBottleQuantity,
            expectedPrivateBottleQuantity: privateUsage[index].personalBottleQuantity,
            storeBottleShortageConfirmed: shortages.some(line=>line.lineKey===item.lineKey&&confirmedShortages[line.lineKey]===shortageKey(line)),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(apiError(data, "تعذر حفظ طلب التوصيل."));
      }
      setSavedOrder({
        orderNumber: data.data.orderNumber,
        paymentState: data.data.paymentState,
        pendingCouponQuantity: data.data.pendingCouponQuantity ?? 0,
      });
    } catch (error) {
      setOrderError(userMessage(error instanceof Error ? error.message : "تعذر تسجيل الطلب."));
    } finally {
      setSavingOrder(false);
    }
  }

  function goToSection(target: string) {
    document
      .getElementById(target)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }

  function changeQuantity(
    productId: string,
    amount: number,
  ) {
    setCart((current) => {
      const next = { ...current };

      const quantity = Math.max(
        0,
        Math.min(
          999,
          (current[productId] ?? 0) + amount,
        ),
      );

      if (quantity === 0) {
        delete next[productId];
      } else {
        next[productId] = quantity;
      }

      return next;
    });
  }

  function changeBottleOriginQuantity(
    productId: string,
    origin: BottleOrigin,
    amount: number,
  ) {
    setBottleOrigins((current) => {
      const existing = current[productId] ?? {
        JORDANIAN: 0,
        SAUDI: 0,
      };

      const otherOrigin: BottleOrigin =
        origin === "JORDANIAN" ? "SAUDI" : "JORDANIAN";

      const remainingCapacity = 999 - existing[otherOrigin];
      const nextQuantity = Math.max(
        0,
        Math.min(remainingCapacity, existing[origin] + amount),
      );

      const updated: BottleOriginCounts = {
        ...existing,
        [origin]: nextQuantity,
      };

      const next = { ...current };
      if (updated.JORDANIAN === 0 && updated.SAUDI === 0) {
        delete next[productId];
      } else {
        next[productId] = updated;
      }
      return next;
    });
  }

  function clearCart() {
    if (itemCount > 0) setConfirmClearCart(true);
  }

  function applyClearCart() {
    setCart({});
    setBottleOrigins({});
    setConfirmClearCart(false);
  }

  function addQuickNote(value: string) {
    setNotes((current) => {
      if (current.includes(value)) {
        return current;
      }

      return current.trim()
        ? `${current.trim()}، ${value}`
        : value;
    });
  }

  if (savedOrder) {
    return (
      <main className={styles.page} dir="rtl">
        <div className={styles.successPage} role="status">
          <span className={styles.successIcon}><Icon name="check" size={36} /></span>
          <small>تم تسجيل الطلب بنجاح</small>
          <h1>طلب اليوم #{savedOrder.orderNumber}</h1>
          <p>الطلب محفوظ في النظام بحالة «جديد».</p>
          {savedOrder.pendingCouponQuantity>0 && <p>المتبقي للطلب: {savedOrder.pendingCouponQuantity} كوبون — أبلغ العميل قبل التوصيل.</p>}
          {savedOrder.paymentState === "COUPONS_RESERVED" && (
            null
          )}
          {newBookletRequested && (
            null
          )}
          <div className={styles.successActions}>
            <button type="button" onClick={() => window.location.reload()}>تسجيل طلب آخر</button>
            <button type="button" onClick={() => router.push(mode==="admin"?"/admin/orders":"/employee/orders")}>عرض طلبات اليوم</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.container}>
        <div className={styles.topBar}>
          <div className={styles.topIdentity}>
            <span className={styles.identityDot} />
            <span>محطة الفنار</span>
            <span className={styles.identityDivider}>
              /
            </span>
            <strong>الطلبات</strong>
            <span className={styles.identityDivider}>
              /
            </span>
            <span>طلب جديد</span>
          </div>

          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.push(mode==="admin"?"/admin/orders":"/employee")}
          >
            <Icon name="arrow" size={17} />
            العودة للرئيسية
          </button>
        </div>

        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroEyebrow}>
              <Icon name="spark" size={15} />
              مساحة العمل اليومية
            </div>

            <h1>طلب توصيل جديد</h1>



            <div className={styles.heroTags}>
              <span>
                <Icon name="phone" size={15} />
                تسجيل هاتفي
              </span>
              <span>
                <Icon name="shield" size={15} />
                بيانات محمية
              </span>
            </div>
          </div>

          <div className={styles.heroSide}>
            <div className={styles.heroSymbol}>
              <Icon name="truck" size={34} />
            </div>

            <span>طلب جديد</span>
            <strong>رقم الطلب</strong>

          </div>
        </header>

        <nav
          className={styles.journey}
          aria-label="مراحل تسجيل الطلب"
        >
          {steps.map((step, index) => {
            const isComplete = index < currentStep;
            const isActive = index === currentStep;

            return (
              <button
                key={step.number}
                type="button"
                className={[
                  styles.journeyItem,
                  isComplete
                    ? styles.journeyComplete
                    : "",
                  isActive
                    ? styles.journeyActive
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() =>
                  goToSection(step.target)
                }
                aria-current={
                  isActive ? "step" : undefined
                }
              >
                <span className={styles.journeyIcon}>
                  {isComplete ? (
                    <Icon name="check" size={19} />
                  ) : (
                    <Icon name={step.icon} size={19} />
                  )}
                </span>

                <span className={styles.journeyText}>
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </span>

                <span className={styles.journeyNumber}>
                  {step.number}
                </span>
              </button>
            );
          })}
        </nav>

        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <section
              id="customer-section"
              className={styles.panel}
            >
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>
                  <Icon name="user" size={22} />
                </span>

                <div className={styles.sectionTitle}>
                  <span className={styles.sectionEyebrow}>
                    الخطوة الأولى
                  </span>
                  <h2>معلومات العميل</h2>

                </div>

                <span className={styles.sectionIndex}>
                  01
                </span>
              </div>

              <div className={styles.customerSearchBox}>
                <div className={styles.customerSearchHeading}>
                  <strong><Icon name="search" size={18} /> ابحث عن عميل مسجل</strong>
                  <span>بالاسم أو رقم الهاتف</span>
                </div>
                {selectedCustomer ? (
                  <div className={styles.chosenCustomer}>
                    <span className={styles.chosenCustomerIcon}><Icon name="check" size={19} /></span>
                    <div>
                      <strong>{selectedCustomer.name}</strong>
                      <small>{selectedCustomer.primaryAddress || "لا يوجد عنوان محفوظ"}</small>
                      {selectedCustomer.specialDelivery20LPriceFils!=null&&<small>تعبئة 20 لتر بالتوصيل: {formatMoney(selectedCustomer.specialDelivery20LPriceFils)} — سعر خاص</small>}
                      <CustomerBottleReminder customerId={selectedCustomer.id} mode={mode}/>
                      {account?.id===selectedCustomer.id && (account.moneyDueFils>0||account.couponsDue>0) && <p role="status">مستحقات سابقة: {formatMoney(account.moneyDueFils)} · {account.couponsDue} كوبون</p>}
                    </div>
                    <div className={styles.customerActions}>
                      <button type="button" onClick={() => goToSection("products-section")}>متابعة الطلب</button>
                      <button type="button" onClick={switchCustomer}>تغيير العميل</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.searchShell}>
                      <Icon name="search" size={19} />
                      <input
                        type="search"
                        aria-label="بحث باسم العميل أو هاتفه"
                        value={customerQuery}
                        placeholder="اكتب اسم العميل أو رقم هاتفه..."
                        onChange={(event) => {
                          setCustomerQuery(event.target.value);
                          setSearchingCustomers(event.target.value.trim().length >= 2);
                          setMatches([]);
                          setCustomerError("");
                        }}
                      />
                      <small>{searchingCustomers ? "بحث..." : ""}</small>
                    </div>
                    {customerQuery.trim().length >= 2 && !searchingCustomers && matches.length === 0 && !customerError && (
                      <p className={styles.searchEmpty}>لا توجد نتائج مطابقة.</p>
                    )}
                    {matches.length > 0 && (
                      <div className={styles.customerResults}>
                        {matches.map((customer) => (
                          <button key={customer.id} type="button" onClick={() => chooseCustomer(customer)}>
                            <span className={styles.customerResultIcon}><Icon name="user" size={18} /></span>
                            <span>
                              <strong>{customer.name}</strong>
                              <small>{customer.primaryAddress || "بدون عنوان محفوظ"}</small>
                            </span>
                            <span className={styles.customerSelectText}>اختيار</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    رقم الهاتف
                    <em>أساسي</em>
                  </span>

                  <div className={styles.inputShell}>
                    <span className={styles.inputIcon}>
                      <Icon name="phone" size={19} />
                    </span>

                    <input
                      type="tel" onPaste={event=>{event.preventDefault();setPhone(limitJordanPhoneInput(event.clipboardData.getData("text")));}}
                  maxLength={14}
                      inputMode="numeric"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="07XXXXXXXX"
                      readOnly={selectedCustomer !== null}
                      value={phone}
                      onChange={(event) =>
                        setPhone(limitJordanPhoneInput(event.target.value))
                      }
                    />
                  </div>


                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    اسم الزبون
                    <em>أساسي</em>
                  </span>

                  <div className={styles.inputShell}>
                    <span className={styles.inputIcon}>
                      <Icon name="user" size={19} />
                    </span>

                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="اسم الزبون"
                      readOnly={selectedCustomer !== null}
                      value={customerName}
                      onChange={(event) =>
                        setCustomerName(
                          event.target.value,
                        )
                      }
                    />
                  </div>


                </label>

                <label
                  className={`${styles.field} ${styles.fullWidth}`}
                >
                  <span className={styles.fieldLabel}>
                    عنوان التوصيل
                    <em>أساسي</em>
                  </span>

                  <div className={styles.inputShell}>
                    <span className={styles.inputIcon}>
                      <Icon name="pin" size={19} />
                    </span>

                    <input
                      type="text"
                      autoComplete="street-address"
                      placeholder="المنطقة، الشارع، العمارة، الطابق..."
                      value={address}
                      onChange={(event) =>
                        setAddress(event.target.value)
                      }
                    />
                  </div>


                </label>
              </div>

              {!selectedCustomer && (
                <div className={styles.customerCreation}>
                  <div>
                    <strong>الزبون غير مسجل؟</strong>

                  </div>
                  <button type="button" disabled={creatingCustomer || !phoneValid || customerName.trim().length < 2 || address.trim().length < 5} onClick={createNewCustomer}>
                    <Icon name="plus" size={17} />
                    {creatingCustomer ? "جاري إضافة العميل..." : "تسجيل عميل جديد"}
                  </button>
                </div>
              )}
              {customerError && <div className={styles.formError} role="alert">{customerError}</div>}
              <div className={styles.inlineNotice}>
                <Icon name="shield" size={18} />

              </div>
            </section>

            <section
              id="products-section"
              className={styles.panel}
            >
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>
                  <Icon name="basket" size={23} />
                </span>

                <div className={styles.sectionTitle}>
                  <span className={styles.sectionEyebrow}>
                    الخطوة الثانية
                  </span>
                  <h2>المنتجات المطلوبة</h2>

                </div>

                <span className={styles.sectionIndex}>
                  02
                </span>
              </div>

              <div className={styles.catalogTop}>
                <div className={styles.searchShell}>
                  <Icon name="search" size={20} />

                  <input
                    type="search"
                    placeholder="ابحث عن اسم المنتج..."
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />

                  <span className={styles.searchCount}>
                    {visibleProducts.length} منتج
                  </span>
                </div>

                {itemCount > 0 && (
                  <span className={styles.selectedCount}>
                    <Icon name="check" size={15} />
                    {itemCount} قطعة محددة
                  </span>
                )}
              </div>

              <div className={styles.categoryBar}>
                {availableCategories.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      category === option.value
                        ? styles.categoryActive
                        : styles.categoryButton
                    }
                    aria-pressed={
                      category === option.value
                    }
                    onClick={() =>
                      setCategory(option.value)
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {visibleProducts.length === 0 ? (
                <div className={styles.productsEmpty}>
                  <span>
                    <Icon name="search" size={27} />
                  </span>
                  <strong>ما لقينا منتجات مطابقة</strong>
                  <p>
                    لا توجد أصناف مطابقة.</p>
                </div>
              ) : (
                <div className={styles.productsGrid}>
                  {visibleProducts.map((product) => {
                    const originRequired = needsBottleOrigin(product);
                    const originCounts = bottleOrigins[product.id] ?? {
                      JORDANIAN: 0,
                      SAUDI: 0,
                    };

                    const quantity = originRequired
                      ? originCounts.JORDANIAN + originCounts.SAUDI
                      : cart[product.id] ?? 0;

                    const selected = quantity > 0;

                    return (
                      <article
                        key={product.id}
                        className={
                          selected
                            ? styles.productSelected
                            : styles.productCard
                        }
                      >
                        <div
                          className={
                            styles.productCardTop
                          }
                        >
                          <span
                            className={
                              styles.productArtwork
                            }
                          >
                            <Icon
                              name="box"
                              size={23}
                            />
                          </span>

                          {selected && (
                            <span
                              className={
                                styles.productSelectedBadge
                              }
                            >
                              <Icon
                                name="check"
                                size={13}
                              />
                              مضاف
                            </span>
                          )}
                        </div>

                        <strong
                          className={styles.productName}
                        >
                          {product.name}
                        </strong>

                        <div
                          className={
                            styles.productPriceRow
                          }
                        >
                          <span>سعر التوصيل</span>
                          <strong>
                            {formatMoney(
                              product.deliveryPriceFils,
                            )}
                          </strong>
                        </div>

                        <div
                          className={
                            styles.productCardFooter
                          }
                        >
                          {originRequired ? (
                            <div className={styles.originPicker}>
                              <div className={styles.originPickerHeader}>
                                <strong>نوع القارورة</strong>
                                <span>
                                  {quantity > 0
                                    ? `${quantity} قوارير`
                                    : "حدد الكميات"}
                                </span>
                              </div>

                              {([
                                ["JORDANIAN", "أردني"],
                                ["SAUDI", "سعودي"],
                              ] as const).map(([origin, label]) => (
                                <div
                                  key={origin}
                                  className={styles.originRow}
                                >
                                  <span className={styles.originLabel}>
                                    {label}
                                  </span>

                                  <div className={styles.quantityControl}>
                                    <button
                                      type="button"
                                      aria-label={`تقليل ${label} من ${product.name}`}
                                      disabled={originCounts[origin] === 0}
                                      onClick={() =>
                                        changeBottleOriginQuantity(
                                          product.id,
                                          origin,
                                          -1,
                                        )
                                      }
                                    >
                                      <Icon name="minus" size={16} />
                                    </button>

                                    <span aria-live="polite">
                                      {originCounts[origin]}
                                    </span>

                                    <button
                                      type="button"
                                      aria-label={`زيادة ${label} من ${product.name}`}
                                      disabled={quantity >= 999}
                                      onClick={() =>
                                        changeBottleOriginQuantity(
                                          product.id,
                                          origin,
                                          1,
                                        )
                                      }
                                    >
                                      <Icon name="plus" size={16} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className={styles.quantityControl}>
                              <button
                                type="button"
                                aria-label={`تقليل كمية ${product.name}`}
                                disabled={quantity === 0}
                                onClick={() =>
                                  changeQuantity(product.id, -1)
                                }
                              >
                                <Icon name="minus" size={16} />
                              </button>

                              <span aria-live="polite">
                                {quantity}
                              </span>

                              <button
                                type="button"
                                aria-label={`زيادة كمية ${product.name}`}
                                disabled={quantity >= 999}
                                onClick={() =>
                                  changeQuantity(product.id, 1)
                                }
                              >
                                <Icon name="plus" size={16} />
                              </button>
                            </div>
                          )}

                          {selected && (
                            <span
                              className={
                                styles.lineSubtotal
                              }
                            >
                              {formatMoney(
                                quantity *
                                  product.deliveryPriceFils,
                              )}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section
              id="payment-section"
              className={styles.panel}
            >
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>
                  <Icon name="receipt" size={23} />
                </span>

                <div className={styles.sectionTitle}>
                  <span className={styles.sectionEyebrow}>
                    الخطوة الثالثة
                  </span>
                  <h2>الدفع وتفاصيل الطلب</h2>

                </div>

                <span className={styles.sectionIndex}>
                  03
                </span>
              </div>

              <div className={styles.subsectionLabel}>
                طريقة الدفع
              </div>

              {shortages.length>0&&<div className={styles.couponInfo} role="status"><div><strong>عدد القوارير الخاصة لا يغطي كامل الطلب</strong>{shortages.map(line=><label key={line.lineKey} style={{display:"block",marginBlock:10}}><input type="checkbox" checked={confirmedShortages[line.lineKey]===shortageKey(line)} onChange={e=>setConfirmedShortages({...confirmedShortages,[line.lineKey]:e.target.checked?shortageKey(line):""})}/> {line.name}: استخدام {line.personalBottleQuantity} من قوارير العميل، وتغطية {line.shortage} من قوارير المحل.</label>)}</div></div>}
              <div className={styles.paymentGrid}>
                {paymentOptions.map((option) => {
                  const active =
                    paymentMethod === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        active
                          ? styles.paymentActive
                          : styles.paymentOption
                      }
                      aria-pressed={active}
                      onClick={() => {paymentTouched.current=true;setPaymentMethod(option.value);}}
                    >
                      <span
                        className={styles.paymentIcon}
                      >
                        <Icon
                          name={option.icon}
                          size={23}
                        />
                      </span>

                      <strong>{option.label}</strong>
                      <small>
                        {option.description}
                      </small>

                      <span
                        className={
                          styles.paymentIndicator
                        }
                      >
                        {active && (
                          <Icon
                            name="check"
                            size={13}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedCustomer && account?.id===selectedCustomer.id && <p role="status">{account.availableCoupons>0?"لدى العميل كوبونات نشطة":"لا يوجد رصيد كوبونات متاح"} — المتاح: {account.availableCoupons}</p>}
              {paymentMethod === "COUPON" && <div role="status" className={styles.couponInfo}><div><strong>{paymentPlan.shortage>0 ? "الكوبونات غير كافية لتغطية كامل التعبئة" : "توزيع الدفع"}</strong><p>{paymentPlan.couponQuantity} كوبون + {formatMoney(paymentPlan.moneyDueFils)} {remainderMethod==="CASH"?"كاش":"كليك"}</p>{paymentPlan.moneyDueFils>0&&<label>دفع المبلغ المتبقي <select value={remainderMethod} onChange={e=>setRemainderMethod(e.target.value as "CASH"|"CLICK")}><option value="CASH">كاش</option><option value="CLICK">كليك / تحويل</option></select></label>}</div></div>}
              {paymentMethod === "COUPON" && accountError && <p role="status">{accountError} يمكن حفظ الطلب والتحقق من النقص عند الحفظ.</p>}
              {paymentMethod === "COUPON" && (
                <div className={styles.couponInfo}>
                  <span className={styles.couponInfoIcon}>
                    <Icon
                      name="ticket"
                      size={22}
                    />
                  </span>

                  <div>
                    <strong>
                      الدفع باستخدام الكوبونات
                    </strong>

                  </div>
                </div>
              )}

              <div className={styles.bookletHeading}>
                <div>
                  <span className={styles.subsectionLabel}>
                    دفتر كوبونات جديد
                  </span>

                </div>

                <span className={styles.bookletHint}>
                  اختياري
                </span>
              </div>

              <button
                type="button"
                className={
                  newBookletRequested
                    ? styles.bookletSelected
                    : styles.bookletOption
                }
                aria-pressed={newBookletRequested}
                onClick={() =>
                  setNewBookletRequested(
                    !newBookletRequested,
                  )
                }
              >
                <span className={styles.bookletIcon}>
                  <Icon name="book" size={25} />
                </span>

                <span className={styles.bookletText}>
                  <strong>
                    الزبون يريد شراء دفتر جديد
                  </strong>

                </span>

                <span
                  className={
                    newBookletRequested
                      ? styles.toggleOn
                      : styles.toggleOff
                  }
                >
                  <span />
                </span>
              </button>

              <div className={styles.notesSection}>
                <div className={styles.notesHeading}>
                  <div className={styles.notesTitle}>
                    <Icon name="note" size={19} />
                    <strong>ملاحظات الطلب</strong>
                  </div>

                  <span>اختياري</span>
                </div>

                <div className={styles.quickNotes}>
                  {quickNotes.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        addQuickNote(value)
                      }
                    >
                      <Icon
                        name="plus"
                        size={13}
                      />
                      {value}
                    </button>
                  ))}
                </div>

                <textarea
                  className={styles.notesInput}
                  rows={3}
                  placeholder="مثال: اتصل قبل الوصول، الطابق الثاني، التسليم عند الباب..."
                  value={notes}
                  maxLength={500}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                />
              </div>
            </section>

            <div className={styles.bottomAssurance}>
              <Icon name="shield" size={19} />

            </div>
          </div>

          <aside className={styles.summaryColumn}>
            <div className={styles.summaryPanel}>
              <div className={styles.summaryHeader}>
                <span className={styles.summaryIcon}>
                  <Icon name="receipt" size={23} />
                </span>

                <div>
                  <span>مراجعة مباشرة</span>
                  <h2>ملخص الطلب</h2>
                </div>

                <span className={styles.summaryCount}>
                  {itemCount}
                </span>
              </div>

              <div className={styles.summaryCustomer}>
                <span className={styles.summaryLabel}>
                  التوصيل إلى
                </span>

                <strong>
                  {customerName.trim() ||
                    "لم يتم تحديد العميل"}
                </strong>

                <small>
                  {address.trim() ||
                    "أضف عنوان التوصيل"}
                </small>
              </div>

              <div className={styles.summaryItemsHeading}>
                <span>المنتجات</span>

                {itemCount > 0 && (
                  <button
                    type="button"
                    className={styles.clearButton}
                    onClick={clearCart}
                  >
                    <Icon
                      name="trash"
                      size={14}
                    />
                    تفريغ
                  </button>
                )}
              </div>

              {selectedProducts.length === 0 ? (
                <div className={styles.emptyCart}>
                  <span>
                    <Icon
                      name="basket"
                      size={30}
                    />
                  </span>

                  <strong>السلة لسه فارغة</strong>


                </div>
              ) : (
                <div className={styles.cartItems}>
                  {selectedProducts.map((item) => (
                    <div
                      key={item.lineKey}
                      className={styles.cartItem}
                    >
                      <span
                        className={
                          styles.cartQuantity
                        }
                      >
                        {item.quantity}×
                      </span>

                      <div
                        className={
                          styles.cartItemDetails
                        }
                      >
                        <strong>{item.name}</strong>
                        <small>
                          {formatMoney(
                            item.deliveryPriceFils,
                          )}{" "}
                          للقطعة
                        </small>
                      </div>

                      <strong
                        className={
                          styles.cartItemPrice
                        }
                      >
                        {formatMoney(
                          item.deliveryPriceFils *
                            item.quantity,
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.summaryPayment}>
                <span>طريقة الدفع</span>

                <strong>
                  <Icon
                    name={
                      paymentOptions.find(
                        (option) =>
                          option.value === paymentMethod,
                      )?.icon ?? "cash"
                    }
                    size={16}
                  />
                  {getPaymentLabel(paymentMethod)}
                </strong>
              </div>

              {newBookletRequested && (
                <div className={styles.bookletSummary}>
                  <Icon name="book" size={19} />

                  <div>
                    <strong>
                      طلب دفتر كوبونات جديد
                    </strong>

                  </div>
                </div>
              )}

              <div className={styles.summaryTotal}>
                <span>إجمالي المنتجات</span>

                <strong>
                  {formatMoney(productsTotalFils)}
                </strong>
              </div>



              {orderError && (
                <div className={styles.formError} role="alert">{orderError}<button type="button" disabled={savingOrder} onClick={()=>{setAccount(null);setAccountRevision(value=>value+1);}}>تحديث بيانات العميل</button></div>
              )}
              {paymentMethod === "COUPON" && <p role="status">{paymentPlan.shortage>0?"تنبيه: رصيد الكوبونات لا يغطي كامل الطلب. ":""}التأكيد: {paymentPlan.couponQuantity} كوبون + {formatMoney(paymentPlan.moneyDueFils)} {remainderMethod==="CASH"?"كاش":"كليك"}.</p>}
              <button
                type="button"
                className={styles.submitButton}
                disabled={savingOrder || !customerReady || !productsReady || !allShortagesConfirmed || (!!selectedCustomer&&account?.id!==selectedCustomer.id&&!accountError)}
                onClick={saveOrder}
              >
                <Icon name="check" size={19} />
                {savingOrder ? "جاري حفظ الطلب..." : "تأكيد وتسجيل الطلب"}
              </button>

              <div className={styles.disabledNote}>
                <Icon name="shield" size={15} />
                يُسجّل الطلب كجديد، والتحصيل النهائي عند التسليم.
              </div>
            </div>

            <div className={styles.sideHelp}>
              <Icon name="info" size={18} />

              <span>
                الطلبات تُحفظ في النظام بعد التأكيد. الكوبونات والدفاتر تخضع لمرحلة الاعتماد المحمية.
              </span>
            </div>
          </aside>
        </div>
      </div>
      <ActionModal
        open={confirmClearCart}
        title="تفريغ المنتجات من الطلب"
        description="سيتم تفريغ المنتجات والكميات المختارة."
        tone="warning"
        confirmLabel="نعم، تفريغ المنتجات"
        onClose={() => setConfirmClearCart(false)}
        onConfirm={applyClearCart}
      />
    </main>
  );
}
