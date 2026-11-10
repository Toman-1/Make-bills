// 1. Page elements and browser storage
const form = document.querySelector("#invoice-form");
const itemList = document.querySelector("#item-list");
const previewItems = document.querySelector("#preview-items-list");
const currency = document.querySelector("#currency");
const logoUpload = document.querySelector("#business-logo-upload");
const previewLogo = document.querySelector("#preview-business-logo");
const removeLogoButton = document.querySelector("#remove-logo");
const savedInvoiceList = document.querySelector("#saved-invoice-list");
const savedCustomersSelect = document.querySelector("#saved-customers");
const storageMessage = document.querySelector("#storage-message");

const STORAGE_KEYS = {
  business: "makeBills.business",
  customers: "makeBills.customers",
  invoices: "makeBills.invoices",
  lastCustomer: "makeBills.lastCustomer"
};
const businessFieldIds = ["from-name", "from-email", "from-gstin", "from-address"];
const invoiceFieldIds = [
  "invoice-number", "currency", "issue-date", "due-date",
  "from-name", "from-email", "from-gstin", "from-address",
  "to-name", "to-email", "to-address", "tax-rate", "notes"
];

let businessLogoData = "";
let activeInvoiceId = "";
let savedCustomers = readStorage(STORAGE_KEYS.customers, []);
let savedInvoices = readStorage(STORAGE_KEYS.invoices, []);
if (!Array.isArray(savedCustomers)) {
  savedCustomers = [];
  showMessage("Saved customer data was invalid and could not be loaded.");
}
if (!Array.isArray(savedInvoices)) {
  savedInvoices = [];
  showMessage("Saved invoice data was invalid and could not be loaded.");
}

function showMessage(message) {
  storageMessage.textContent = message;
}

function readStorage(key, fallback) {
  try {
    const savedValue = localStorage.getItem(key);
    return savedValue ? JSON.parse(savedValue) : fallback;
  } catch {
    showMessage("Could not read saved data from this browser.");
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showMessage("Could not save data. Browser storage may be full or unavailable.");
    return false;
  }
}

// 2. Formatting helpers
function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.value
  }).format(amount);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function localDateString(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

// 3. Business details and customer profiles
function setBusinessLogo(data) {
  businessLogoData = data || "";
  if (businessLogoData) {
    previewLogo.src = businessLogoData;
    previewLogo.hidden = false;
    removeLogoButton.hidden = false;
  } else {
    previewLogo.removeAttribute("src");
    previewLogo.hidden = true;
    removeLogoButton.hidden = true;
  }
}

function saveBusinessDetails() {
  const business = {};
  businessFieldIds.forEach((id) => {
    business[id] = document.getElementById(id).value;
  });
  business.logo = businessLogoData;

  if (writeStorage(STORAGE_KEYS.business, business)) {
    showMessage("Business information is saved on this browser.");
  }
}

function loadBusinessDetails(business = readStorage(STORAGE_KEYS.business, {})) {
  businessFieldIds.forEach((id) => {
    document.getElementById(id).value = business[id] || "";
  });
  setBusinessLogo(business.logo);
}

function customerDetails() {
  return {
    name: document.querySelector("#to-name").value.trim(),
    email: document.querySelector("#to-email").value.trim(),
    address: document.querySelector("#to-address").value.trim()
  };
}

function renderCustomers(selectedId = "") {
  savedCustomersSelect.replaceChildren(new Option("Choose a saved customer", ""));
  savedCustomers.forEach((customer) => {
    const option = new Option(
      customer.email ? `${customer.name} (${customer.email})` : customer.name,
      customer.id
    );
    savedCustomersSelect.add(option);
  });
  savedCustomersSelect.value = selectedId;
}

function saveCustomer(showConfirmation = true) {
  const customer = customerDetails();
  if (!customer.name) {
    if (showConfirmation) showMessage("Enter a client name before saving customer details.");
    return "";
  }

  customer.id = (customer.email || customer.name).toLowerCase();
  const updatedCustomers = [...savedCustomers];
  const existingIndex = updatedCustomers.findIndex((saved) => saved.id === customer.id);
  if (existingIndex === -1) {
    updatedCustomers.push(customer);
  } else {
    updatedCustomers[existingIndex] = customer;
  }

  if (!writeStorage(STORAGE_KEYS.customers, updatedCustomers)) return null;
  savedCustomers = updatedCustomers;
  if (!writeStorage(STORAGE_KEYS.lastCustomer, customer.id)) return null;
  renderCustomers(customer.id);
  if (showConfirmation) showMessage("Customer details saved on this browser.");
  return customer.id;
}

function loadCustomer(id) {
  const customer = savedCustomers.find((saved) => saved.id === id);
  if (!customer) return;

  document.querySelector("#to-name").value = customer.name;
  document.querySelector("#to-email").value = customer.email;
  document.querySelector("#to-address").value = customer.address;
  writeStorage(STORAGE_KEYS.lastCustomer, customer.id);
  updatePreview();
}

// 4. Invoice items and live preview
function addItem(description = "", quantity = 1, rate = "") {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input type="text" placeholder="Item or service" aria-label="Item description">
    <input type="number" min="0" step="any" value="1" aria-label="Quantity">
    <input type="number" min="0" step="0.01" placeholder="0.00" aria-label="Rate">
    <button class="remove-item" type="button" aria-label="Remove item">×</button>
  `;
  const inputs = row.querySelectorAll("input");
  inputs[0].value = description;
  inputs[1].value = quantity;
  inputs[2].value = rate;
  itemList.append(row);
  updatePreview();
}

function getItems() {
  return [...itemList.querySelectorAll(".item-row")].map((row) => {
    const [description, quantity, rate] = row.querySelectorAll("input");
    const qty = Math.max(0, Number(quantity.value) || 0);
    const price = Math.max(0, Number(rate.value) || 0);
    return {
      description: description.value.trim(),
      quantity: qty,
      rate: price,
      amount: qty * price
    };
  });
}

function updatePreview() {
  const previewFields = [
    ["invoice-number", "preview-number", "—"],
    ["from-name", "preview-from-name", "Your business name"],
    ["from-email", "preview-from-email", ""],
    ["from-gstin", "preview-from-gstin", ""],
    ["from-address", "preview-from-address", ""],
    ["to-name", "preview-to-name", "Client name"],
    ["to-email", "preview-to-email", ""],
    ["to-address", "preview-to-address", ""]
  ];

  previewFields.forEach(([inputId, previewId, fallback]) => {
    const value = document.getElementById(inputId).value.trim();
    document.getElementById(previewId).textContent = value || fallback;
  });
  document.querySelector("#preview-issue-date").textContent =
    formatDate(document.querySelector("#issue-date").value);
  document.querySelector("#preview-due-date").textContent =
    formatDate(document.querySelector("#due-date").value);

  const items = getItems();
  previewItems.replaceChildren();
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "preview-item";
    [
      item.description || "Item description",
      item.quantity,
      formatMoney(item.rate),
      formatMoney(item.amount)
    ].forEach((value) => {
      const cell = document.createElement("span");
      cell.textContent = value;
      row.append(cell);
    });
    previewItems.append(row);
  });

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxRate = Math.max(0, Number(document.querySelector("#tax-rate").value) || 0);
  const tax = subtotal * taxRate / 100;
  document.querySelector("#preview-subtotal").textContent = formatMoney(subtotal);
  document.querySelector("#preview-tax-label").textContent = `Tax (${taxRate}%)`;
  document.querySelector("#preview-tax").textContent = formatMoney(tax);
  document.querySelector("#preview-total").textContent = formatMoney(subtotal + tax);

  const notes = document.querySelector("#notes").value.trim();
  document.querySelector("#preview-notes-wrap").hidden = !notes;
  document.querySelector("#preview-notes").textContent = notes;
}

// 5. Save, reopen, delete, and start invoices
function nextInvoiceNumber() {
  const highestNumber = savedInvoices.reduce((highest, invoice) => {
    const match = /^INV-(\d+)$/i.exec(invoice.number || "");
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `INV-${String(highestNumber + 1).padStart(3, "0")}`;
}

function renderInvoices(selectedId = "") {
  savedInvoiceList.replaceChildren();

  if (!savedInvoices.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-state";
    emptyMessage.textContent = "No saved invoices yet. Save an invoice from the Home page to see it here.";
    savedInvoiceList.append(emptyMessage);
    return;
  }

  savedInvoices.forEach((invoice) => {
    const card = document.createElement("article");
    card.className = "saved-invoice-card";

    const details = document.createElement("div");
    details.className = "saved-invoice-details";
    const number = document.createElement("h2");
    number.textContent = invoice.number || "Invoice";
    const customer = document.createElement("p");
    customer.textContent = invoice.customerName || "No client";
    const date = document.createElement("span");
    date.textContent = formatDate(invoice.issueDate);
    details.append(number, customer, date);

    const actions = document.createElement("div");
    actions.className = "saved-invoice-actions";
    const openButton = document.createElement("button");
    openButton.className = "button button-primary";
    openButton.type = "button";
    openButton.textContent = "Open invoice";
    openButton.addEventListener("click", () => openInvoice(invoice.id));
    const deleteButton = document.createElement("button");
    deleteButton.className = "button button-light";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteInvoice(invoice.id));
    actions.append(openButton, deleteButton);
    card.append(details, actions);
    savedInvoiceList.append(card);
  });
}

function saveInvoice() {
  const numberInput = document.querySelector("#invoice-number");
  if (!numberInput.value.trim()) {
    numberInput.setCustomValidity("Enter an invoice number before saving.");
    numberInput.reportValidity();
    numberInput.setCustomValidity("");
    return;
  }

  const customerId = saveCustomer(false);
  if (customerId === null) return;
  const invoice = {
    id: activeInvoiceId || `invoice-${Date.now()}`,
    number: numberInput.value.trim(),
    customerName: document.querySelector("#to-name").value.trim(),
    issueDate: document.querySelector("#issue-date").value,
    logo: businessLogoData,
    items: getItems(),
    savedAt: new Date().toISOString()
  };
  invoice.fields = {};
  invoiceFieldIds.forEach((id) => {
    invoice.fields[id] = document.getElementById(id).value;
  });

  const existingIndex = savedInvoices.findIndex((saved) =>
    saved.id === activeInvoiceId || saved.number === invoice.number
  );
  if (existingIndex === -1) {
    savedInvoices.push(invoice);
  } else {
    invoice.id = savedInvoices[existingIndex].id;
    savedInvoices[existingIndex] = invoice;
  }

  if (!writeStorage(STORAGE_KEYS.invoices, savedInvoices)) return;
  activeInvoiceId = invoice.id;
  renderInvoices();
  showMessage(customerId
    ? "Invoice and customer saved on this browser."
    : "Invoice saved on this browser.");
}

function openInvoice(id) {
  const invoice = savedInvoices.find((saved) => saved.id === id);
  if (!invoice) {
    showMessage("Choose a saved invoice to open.");
    return;
  }

  invoiceFieldIds.forEach((fieldId) => {
    document.getElementById(fieldId).value = invoice.fields[fieldId] || "";
  });
  itemList.replaceChildren();
  invoice.items.forEach((item) => addItem(item.description, item.quantity, item.rate));
  if (!invoice.items.length) addItem();
  setBusinessLogo(invoice.logo || "");
  activeInvoiceId = invoice.id;
  const customer = savedCustomers.find((saved) =>
    saved.name === invoice.fields["to-name"] && saved.email === invoice.fields["to-email"]
  );
  renderCustomers(customer ? customer.id : "");
  updatePreview();
  showPage("home-page");
  showMessage(`Opened ${invoice.number}.`);
}

function deleteInvoice(id) {
  if (!id) {
    return;
  }

  const invoice = savedInvoices.find((saved) => saved.id === id);
  if (!confirm(`Delete ${invoice.number}? This cannot be undone.`)) return;

  savedInvoices = savedInvoices.filter((saved) => saved.id !== id);
  if (!writeStorage(STORAGE_KEYS.invoices, savedInvoices)) return;
  if (activeInvoiceId === id) activeInvoiceId = "";
  renderInvoices();
  showMessage(`${invoice.number} was deleted.`);
}

function startNewInvoice(showConfirmation = true) {
  if (saveCustomer(false) === null) return;
  loadBusinessDetails();
  const lastCustomerId = readStorage(STORAGE_KEYS.lastCustomer, "");
  const customer = savedCustomers.find((saved) => saved.id === lastCustomerId);
  invoiceFieldIds.forEach((id) => {
    if (!businessFieldIds.includes(id)) {
      document.getElementById(id).value = "";
    }
  });
  document.querySelector("#invoice-number").value = nextInvoiceNumber();
  document.querySelector("#currency").value = "INR";
  document.querySelector("#tax-rate").value = "0";
  document.querySelector("#notes").value = "";
  const today = new Date();
  document.querySelector("#issue-date").value = localDateString(today);
  today.setDate(today.getDate() + 14);
  document.querySelector("#due-date").value = localDateString(today);
  if (customer) {
    document.querySelector("#to-name").value = customer.name;
    document.querySelector("#to-email").value = customer.email;
    document.querySelector("#to-address").value = customer.address;
    renderCustomers(customer.id);
  } else {
    renderCustomers();
  }
  itemList.replaceChildren();
  activeInvoiceId = "";
  addItem();
  if (showConfirmation) {
    showMessage("Started a new invoice with your saved business and customer details.");
  }
}

// 6. Page navigation
function showPage(pageId) {
  document.querySelectorAll(".page-view").forEach((page) => {
    page.hidden = page.id !== pageId;
  });
  document.querySelectorAll(".menu-link").forEach((button) => {
    const isActive = button.dataset.page === pageId;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".home-only").forEach((element) => {
    element.hidden = pageId !== "home-page";
  });
}

document.querySelectorAll(".menu-link").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

// 7. Buttons, uploads, and automatic business profile saving
form.addEventListener("input", updatePreview);
form.addEventListener("change", updatePreview);
businessFieldIds.forEach((id) => {
  document.getElementById(id).addEventListener("input", saveBusinessDetails);
});

document.querySelector("#add-item").addEventListener("click", () => addItem());
document.querySelector("#save-customer").addEventListener("click", () => saveCustomer());
savedCustomersSelect.addEventListener("change", () => loadCustomer(savedCustomersSelect.value));
document.querySelector("#save-invoice").addEventListener("click", saveInvoice);
document.querySelector("#new-invoice").addEventListener("click", startNewInvoice);
document.querySelectorAll("#print-button, #print-button-bottom").forEach((button) => {
  button.addEventListener("click", () => window.print());
});

logoUpload.addEventListener("change", () => {
  const file = logoUpload.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 1024 * 1024) {
    showMessage("Choose an image smaller than 1 MB.");
    logoUpload.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    setBusinessLogo(reader.result);
    saveBusinessDetails();
  };
  reader.onerror = () => showMessage("Could not read the selected logo.");
  reader.readAsDataURL(file);
});

removeLogoButton.addEventListener("click", () => {
  setBusinessLogo("");
  logoUpload.value = "";
  saveBusinessDetails();
});

itemList.addEventListener("click", (event) => {
  if (!event.target.matches(".remove-item")) return;
  event.target.closest(".item-row").remove();
  updatePreview();
});

// 8. Restore saved data and set up a new invoice
loadBusinessDetails();
renderCustomers();
renderInvoices();
startNewInvoice(false);
showPage("home-page");
