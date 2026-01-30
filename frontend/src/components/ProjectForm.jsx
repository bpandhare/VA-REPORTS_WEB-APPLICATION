import React, { useState, useEffect } from "react";
import { updateProject, createProject, getCustomersList } from "../services/api";

const ProjectForm = ({ projectId, initialData, onSuccess, onClose }) => {
  // Form state
  const [formState, setFormState] = useState({
    name: "",
    customer: "",
    end_customer: "",
    assigned_employee: "",
    assigned_employees: [], // NEW: Array for multiple employees
    newCustomer: "",
    newEndCustomer: "",
    description: "",
    status: "active",
    priority: "medium",
    start_date: "",
    end_date: "",
    budget: "",
    requires_reporting: true,
    // Contact fields for customer
    customer_person: "",
    customer_email: "",
    customer_contact: "",
    customer_address: "",
    // Contact fields for end customer
    end_customer_person: "",
    end_customer_email: "",
    end_customer_contact: "",
    end_customer_address: "",
  });

  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [isEditMode, setIsEditMode] = useState(false);
  const [employeeSearchInput, setEmployeeSearchInput] = useState(""); // NEW: For employee search
  const [availableEmployees, setAvailableEmployees] = useState([]); // NEW: List of available employees
  
  // Customer database with full contact info
  const [customerDatabase, setCustomerDatabase] = useState([]);
  
  // Predefined customers (fallback if API fails)
  const predefinedCustomers = [
    {
      id: 'cee_dee',
      name: 'CEE DEE',
      contact_person: 'Mr. John Smith',
      email: 'john.smith@ceedee.com',
      contact_number: '+91 98765 43210',
      address: '123 Business Park, Mumbai, Maharashtra 400001'
    },
    {
      id: 'abc_corp',
      name: 'ABC Corporation',
      contact_person: 'Ms. Sarah Johnson',
      email: 'sarah.j@abccorp.com',
      contact_number: '+91 87654 32109',
      address: '456 Corporate Tower, Delhi, Delhi 110001'
    },
    {
      id: 'xyz_ind',
      name: 'XYZ Industries',
      contact_person: 'Mr. Rajesh Kumar',
      email: 'rajesh.k@xyzindustries.com',
      contact_number: '+91 76543 21098',
      address: '789 Industrial Estate, Bangalore, Karnataka 560001'
    },
    {
      id: 'global_tech',
      name: 'Global Tech Solutions',
      contact_person: 'Ms. Priya Sharma',
      email: 'priya.sharma@globaltech.com',
      contact_number: '+91 65432 10987',
      address: '321 Tech Park, Hyderabad, Telangana 500001'
    },
    {
      id: 'prime_const',
      name: 'Prime Construction',
      contact_person: 'Mr. Amit Patel',
      email: 'amit.patel@primeconstruction.com',
      contact_number: '+91 54321 09876',
      address: '654 Builders Plaza, Ahmedabad, Gujarat 380001'
    },
  ];

  useEffect(() => {
    console.log("ProjectForm received:", { 
      projectId, 
      initialData: initialData ? { 
        id: initialData.id, 
        name: initialData.name,
        customer_person: initialData.customer_person,
        customer_contact: initialData.customer_contact
      } : null,
      isEditMode: !!projectId
    });
    
    setIsEditMode(!!projectId);
    fetchCustomers();
  }, [projectId, initialData]);

  // Fetch customers from API or use predefined
  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const response = await getCustomersList();
      if (response.data?.success) {
        // Combine API customers with predefined ones
        const apiCustomers = response.data.customers_with_details || response.data.customers || [];
        const allCustomers = [...predefinedCustomers, ...apiCustomers];
        setCustomers(allCustomers.map(c => c.name));
        setCustomerDatabase(allCustomers);
      } else {
        // Use predefined customers if API fails
        setCustomers(predefinedCustomers.map(c => c.name));
        setCustomerDatabase(predefinedCustomers);
      }
    } catch (error) {
      console.error("Failed to fetch customers, using predefined:", error);
      setCustomers(predefinedCustomers.map(c => c.name));
      setCustomerDatabase(predefinedCustomers);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Handle customer selection change
  const handleCustomerChange = (customerName) => {
    if (customerName === "Other") {
      // For "Other", reset customer fields for manual entry
      setFormState(prev => ({
        ...prev,
        customer: "Other",
        newCustomer: "",
        customer_person: "",
        customer_email: "",
        customer_contact: "",
        customer_address: ""
      }));
    } else if (customerName === "") {
      // For empty selection, reset everything
      setFormState(prev => ({
        ...prev,
        customer: "",
        newCustomer: "",
        customer_person: "",
        customer_email: "",
        customer_contact: "",
        customer_address: ""
      }));
    } else {
      // Find selected customer in database
      const selectedCustomer = customerDatabase.find(c => c.name === customerName);
      if (selectedCustomer) {
        // Auto-fill customer details
        setFormState(prev => ({
          ...prev,
          customer: customerName,
          newCustomer: "",
          customer_person: selectedCustomer.contact_person || "",
          customer_email: selectedCustomer.email || "",
          customer_contact: selectedCustomer.contact_number || "",
          customer_address: selectedCustomer.address || ""
        }));
      } else {
        // Customer not found in database
        setFormState(prev => ({
          ...prev,
          customer: customerName,
          newCustomer: "",
          customer_person: "",
          customer_email: "",
          customer_contact: "",
          customer_address: ""
        }));
      }
    }
  };

  // Handle end customer selection change
  const handleEndCustomerChange = (endCustomerName) => {
    if (endCustomerName === "Other") {
      // For "Other", reset end customer fields for manual entry
      setFormState(prev => ({
        ...prev,
        end_customer: "Other",
        newEndCustomer: "",
        end_customer_person: "",
        end_customer_email: "",
        end_customer_contact: "",
        end_customer_address: ""
      }));
    } else if (endCustomerName === "Same as Customer") {
      // Copy customer details to end customer
      setFormState(prev => ({
        ...prev,
        end_customer: "Same as Customer",
        end_customer_person: prev.customer_person,
        end_customer_email: prev.customer_email,
        end_customer_contact: prev.customer_contact,
        end_customer_address: prev.customer_address
      }));
    } else if (endCustomerName === "") {
      // For empty selection, reset everything
      setFormState(prev => ({
        ...prev,
        end_customer: "",
        newEndCustomer: "",
        end_customer_person: "",
        end_customer_email: "",
        end_customer_contact: "",
        end_customer_address: ""
      }));
    } else {
      // Find selected end customer in database
      const selectedEndCustomer = customerDatabase.find(c => c.name === endCustomerName);
      if (selectedEndCustomer) {
        // Auto-fill end customer details
        setFormState(prev => ({
          ...prev,
          end_customer: endCustomerName,
          newEndCustomer: "",
          end_customer_person: selectedEndCustomer.contact_person || "",
          end_customer_email: selectedEndCustomer.email || "",
          end_customer_contact: selectedEndCustomer.contact_number || "",
          end_customer_address: selectedEndCustomer.address || ""
        }));
      } else {
        // End customer not found in database
        setFormState(prev => ({
          ...prev,
          end_customer: endCustomerName,
          newEndCustomer: "",
          end_customer_person: "",
          end_customer_email: "",
          end_customer_contact: "",
          end_customer_address: ""
        }));
      }
    }
  };

  // Initialize form with initialData for edit mode
  useEffect(() => {
    if (initialData && projectId) {
      console.log("Loading initial data for edit:", initialData);
      
      const formatDate = (dateString) => {
        if (!dateString) return "";
        try {
          const date = new Date(dateString);
          return date.toISOString().split('T')[0];
        } catch (e) {
          return "";
        }
      };

      setFormState({
        name: initialData.name || "",
        customer: initialData.customer || "",
        end_customer: initialData.end_customer || "",
        assigned_employee: initialData.assigned_employee || initialData.employee_id || "",
        newCustomer: "",
        newEndCustomer: "",
        description: initialData.description || "",
        status: initialData.status || "active",
        priority: initialData.priority || "medium",
        start_date: formatDate(initialData.start_date),
        end_date: formatDate(initialData.end_date),
        budget: initialData.budget || "",
        requires_reporting: initialData.requires_reporting !== false,
        // Contact fields
        customer_person: initialData.customer_person || initialData.customer_contact_person || "",
        customer_email: initialData.customer_email || "",
        customer_contact: initialData.customer_contact || initialData.contact_number || "",
        customer_address: initialData.customer_address || "",
        end_customer_person: initialData.end_customer_person || "",
        end_customer_email: initialData.end_customer_email || "",
        end_customer_contact: initialData.end_customer_contact || "",
        end_customer_address: initialData.end_customer_address || "",
      });
    } else {
      console.log("Setting up for create mode");
      setFormState({
        name: "",
        customer: "",
        end_customer: "",
        assigned_employee: "",
        newCustomer: "",
        newEndCustomer: "",
        description: "",
        status: "active",
        priority: "medium",
        start_date: "",
        end_date: "",
        budget: "",
        requires_reporting: true,
        // Contact fields
        customer_person: "",
        customer_email: "",
        customer_contact: "",
        customer_address: "",
        end_customer_person: "",
        end_customer_email: "",
        end_customer_contact: "",
        end_customer_address: "",
      });
    }
  }, [projectId, initialData]);

  // Generic form field handler
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    console.log(`Field change: ${name} = ${value}`);
    
    // Handle special dropdown cases
    if (name === "customer") {
      handleCustomerChange(value);
    } else if (name === "end_customer") {
      handleEndCustomerChange(value);
    } else {
      setFormState(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Show message helper
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage({ type: "", text: "" });

    // Validate required fields
    if (!formState.name.trim()) {
      showMessage("error", "Project name is required");
      setIsSubmitting(false);
      return;
    }
    
    // Determine customer name
    const customerName = formState.customer === "Other" 
      ? formState.newCustomer.trim() 
      : formState.customer;
    
    if (!customerName) {
      showMessage("error", "Customer name is required");
      setIsSubmitting(false);
      return;
    }
    
    // Determine end customer name
    const endCustomerName = formState.end_customer === "Other"
      ? formState.newEndCustomer.trim()
      : (formState.end_customer === "Same as Customer" ? customerName : formState.end_customer);

    console.log("=== FORM SUBMISSION DATA ===");
    console.log("Mode:", isEditMode ? "EDIT" : "CREATE");
    console.log("Customer Details:", {
      customer: customerName,
      customer_person: formState.customer_person,
      customer_email: formState.customer_email,
      customer_contact: formState.customer_contact,
      customer_address: formState.customer_address
    });
    console.log("End Customer Details:", {
      end_customer: endCustomerName,
      end_customer_person: formState.end_customer_person,
      end_customer_email: formState.end_customer_email,
      end_customer_contact: formState.end_customer_contact,
      end_customer_address: formState.end_customer_address
    });

    try {
      // Prepare data for submission
      const cleanedData = { 
        name: formState.name.trim(),
        customer: customerName,
        end_customer: endCustomerName || null,
        description: formState.description.trim() || "",
        status: formState.status,
        priority: formState.priority,
        start_date: formState.start_date || null,
        end_date: formState.end_date || null,
        budget: formState.budget || null,
        requires_reporting: formState.requires_reporting,
        // Customer contact info
        customer_person: formState.customer_person.trim() || null,
        customer_email: formState.customer_email.trim() || null,
        customer_contact: formState.customer_contact.trim() || null,
        customer_address: formState.customer_address.trim() || null,
        // End customer contact info
        end_customer_person: formState.end_customer_person.trim() || null,
        end_customer_email: formState.end_customer_email.trim() || null,
        end_customer_contact: formState.end_customer_contact.trim() || null,
        end_customer_address: formState.end_customer_address.trim() || null,
      };
      
      // Add assigned employee if provided
      if (formState.assigned_employee.trim()) {
        cleanedData.assigned_employee = formState.assigned_employee.trim();
      }
      
      // NEW: Add multiple assigned employees
      if (formState.assigned_employees && formState.assigned_employees.length > 0) {
        cleanedData.assigned_employees = formState.assigned_employees;
      }
      
      console.log("Cleaned data to send:", cleanedData);

      let response;
      
      if (isEditMode && projectId) {
        console.log(`Attempting to UPDATE project ${projectId}...`);
        response = await updateProject(projectId, cleanedData);
        
        if (response.data?.success) {
          showMessage("success", response.data.message || "Project updated successfully!");
          if (onSuccess) onSuccess(response.data.project || response.data);
          if (onClose) setTimeout(() => onClose(), 1000);
        } else {
          const errorMsg = response.data?.message || "Failed to update project";
          showMessage("error", errorMsg);
        }
      } 
      else {
        console.log("Attempting to CREATE new project...");
        response = await createProject(cleanedData);
        
        if (response.data?.success) {
          showMessage("success", response.data.message || "Project created successfully!");
          if (onSuccess) onSuccess(response.data.project || response.data);
          if (onClose) setTimeout(() => onClose(), 1000);
        } else {
          const errorMsg = response.data?.message || "Failed to create project";
          showMessage("error", errorMsg);
        }
      }
    } catch (error) {
      console.error("❌ Error:", error);
      showMessage("error", error.response?.data?.message || error.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to check if field was auto-filled
  const isAutoFilled = (fieldName) => {
    const customerName = formState.customer;
    if (!customerName || customerName === "Other") return false;
    
    const customer = customerDatabase.find(c => c.name === customerName);
    if (!customer) return false;
    
    switch(fieldName) {
      case 'customer_person': return !!customer.contact_person && formState.customer_person === customer.contact_person;
      case 'customer_email': return !!customer.email && formState.customer_email === customer.email;
      case 'customer_contact': return !!customer.contact_number && formState.customer_contact === customer.contact_number;
      case 'customer_address': return !!customer.address && formState.customer_address === customer.address;
      default: return false;
    }
  };

  // Helper for end customer auto-fill
  const isEndCustomerAutoFilled = (fieldName) => {
    if (formState.end_customer === "Same as Customer") {
      // Check if it matches the customer's data
      const customerName = formState.customer;
      if (!customerName || customerName === "Other") return false;
      
      const customer = customerDatabase.find(c => c.name === customerName);
      if (!customer) return false;
      
      switch(fieldName) {
        case 'end_customer_person': return !!customer.contact_person && formState.end_customer_person === customer.contact_person;
        case 'end_customer_email': return !!customer.email && formState.end_customer_email === customer.email;
        case 'end_customer_contact': return !!customer.contact_number && formState.end_customer_contact === customer.contact_number;
        case 'end_customer_address': return !!customer.address && formState.end_customer_address === customer.address;
        default: return false;
      }
    } else {
      const endCustomerName = formState.end_customer;
      if (!endCustomerName || endCustomerName === "Other") return false;
      
      const endCustomer = customerDatabase.find(c => c.name === endCustomerName);
      if (!endCustomer) return false;
      
      switch(fieldName) {
        case 'end_customer_person': return !!endCustomer.contact_person && formState.end_customer_person === endCustomer.contact_person;
        case 'end_customer_email': return !!endCustomer.email && formState.end_customer_email === endCustomer.email;
        case 'end_customer_contact': return !!endCustomer.contact_number && formState.end_customer_contact === endCustomer.contact_number;
        case 'end_customer_address': return !!endCustomer.address && formState.end_customer_address === endCustomer.address;
        default: return false;
      }
    }
  };

  const formTitle = isEditMode ? "Edit Project" : "Create New Project";
  const submitButtonText = isEditMode 
    ? (isSubmitting ? "Updating..." : "Update Project")
    : (isSubmitting ? "Creating..." : "Create Project");

  // Inline styles
  const styles = {
    projectForm: {
      padding: "20px",
      maxWidth: "900px",
      margin: "0 auto",
      backgroundColor: "#fff",
      borderRadius: "8px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    },
    formTitle: {
      marginBottom: "15px",
      color: "#333",
      fontSize: "1.5rem",
      fontWeight: "600",
    },
    formGroup: {
      marginBottom: "20px",
    },
    label: {
      display: "block",
      marginBottom: "8px",
      fontWeight: "500",
      color: "#444",
      fontSize: "14px",
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "14px",
      transition: "border-color 0.2s",
    },
    textarea: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "14px",
      fontFamily: "inherit",
      resize: "vertical",
      minHeight: "80px",
    },
    select: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "14px",
      backgroundColor: "white",
      cursor: "pointer",
    },
    disabled: {
      backgroundColor: "#f5f5f5",
      cursor: "not-allowed",
      opacity: "0.7",
    },
    focus: {
      outline: "none",
      borderColor: "#007bff",
      boxShadow: "0 0 0 2px rgba(0,123,255,0.25)",
    },
    newCustomerField: {
      marginTop: "15px",
      padding: "15px",
      backgroundColor: "#f8f9fa",
      borderRadius: "4px",
      border: "1px solid #e9ecef",
    },
    fieldHint: {
      display: "block",
      marginTop: "6px",
      color: "#6c757d",
      fontSize: "12px",
      fontStyle: "italic",
    },
    autoFillHint: {
      display: "inline-block",
      marginLeft: "8px",
      padding: "3px 8px",
      backgroundColor: "#e3f2fd",
      color: "#1976d2",
      fontSize: "11px",
      borderRadius: "4px",
      fontWeight: "500",
    },
    autoFillField: {
      backgroundColor: "#f0fff4",
      borderColor: "#9ae6b4",
      borderLeft: "3px solid #38a169",
    },
    loadingSelect: {
      padding: "12px",
      textAlign: "center",
      color: "#6c757d",
      background: "#f8f9fa",
      borderRadius: "4px",
      border: "1px dashed #dee2e6",
    },
    formRow: {
      display: "flex",
      gap: "15px",
      flexWrap: "wrap",
    },
    formColumn: {
      flex: "1 1 calc(50% - 8px)",
      minWidth: "250px",
    },
    formActions: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "15px",
      marginTop: "30px",
      paddingTop: "20px",
      borderTop: "1px solid #eee",
    },
    btnPrimary: {
      background: "#007bff",
      color: "white",
      padding: "12px 24px",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "500",
      fontSize: "14px",
      transition: "background 0.2s",
      minWidth: "140px",
    },
    btnPrimaryHover: {
      background: "#0056b3",
    },
    btnPrimaryDisabled: {
      background: "#ccc",
      cursor: "not-allowed",
    },
    btnSecondary: {
      background: "#6c757d",
      color: "white",
      padding: "12px 24px",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      transition: "background 0.2s",
    },
    btnSecondaryHover: {
      background: "#545b62",
    },
    btnSecondaryDisabled: {
      background: "#ccc",
      cursor: "not-allowed",
    },
    message: {
      padding: "12px 15px",
      marginBottom: "20px",
      borderRadius: "4px",
      fontWeight: "500",
      fontSize: "14px",
    },
    messageSuccess: {
      background: "#d4edda",
      color: "#155724",
      border: "1px solid #c3e6cb",
    },
    messageError: {
      background: "#f8d7da",
      color: "#721c24",
      border: "1px solid #f5c6cb",
    },
    sectionHeader: {
      marginTop: "25px",
      marginBottom: "15px",
      paddingBottom: "8px",
      borderBottom: "2px solid #007bff",
      color: "#007bff",
      fontSize: "1.1rem",
      fontWeight: "600",
    },
    sectionSubHeader: {
      margin: "15px 0 10px",
      color: "#495057",
      fontSize: "0.95rem",
      fontWeight: "500",
    },
    checkboxLabel: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      cursor: "pointer",
    },
    checkbox: {
      width: "18px",
      height: "18px",
      cursor: "pointer",
    },
  };

  return (
    <div style={styles.projectForm}>
      <h2 style={styles.formTitle}>{formTitle}</h2>
      
      {message.text && (
        <div 
          style={{
            ...styles.message,
            ...(message.type === 'success' ? styles.messageSuccess : {}),
            ...(message.type === 'error' ? styles.messageError : {}),
          }}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Basic Project Details */}
        <h3 style={styles.sectionHeader}>Project Information</h3>
        
        <div style={styles.formGroup}>
          <label htmlFor="name" style={styles.label}>
            Project Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formState.name}
            onChange={handleChange}
            required
            placeholder="Enter project name"
            disabled={isSubmitting}
            style={{
              ...styles.input,
              ...(isSubmitting ? styles.disabled : {}),
            }}
          />
        </div>

     
        {/* Customer Details Section */}
        <h3 style={styles.sectionHeader}>Customer Details</h3>
        
        <div style={styles.formGroup}>
          <label htmlFor="customer" style={styles.label}>
            Customer Name *
            {formState.customer && formState.customer !== "Other" && isAutoFilled('customer_person') && (
              <span style={styles.autoFillHint}>Details auto-filled</span>
            )}
          </label>
          {loadingCustomers ? (
            <div style={styles.loadingSelect}>Loading customers...</div>
          ) : (
            <select
              id="customer"
              name="customer"
              value={formState.customer}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              style={{
                ...styles.select,
                ...(isSubmitting ? styles.disabled : {}),
              }}
            >
              <option value="">Select Customer</option>
              {customers.map((customerName, index) => (
                <option key={index} value={customerName}>
                  {customerName}
                </option>
              ))}
              <option value="Other">Other (Specify Below)</option>
            </select>
          )}
        </div>

        {formState.customer === "Other" && (
          <div style={styles.newCustomerField}>
            <label htmlFor="newCustomer" style={styles.label}>
              Specify Customer Name *
            </label>
            <input
              type="text"
              id="newCustomer"
              name="newCustomer"
              value={formState.newCustomer}
              onChange={handleChange}
              placeholder="Enter new customer name"
              disabled={isSubmitting}
              required
              style={{
                ...styles.input,
                ...(isSubmitting ? styles.disabled : {}),
              }}
            />
          </div>
        )}

        {/* Customer Contact Details */}
        <h4 style={styles.sectionSubHeader}>Contact Information</h4>
        
        <div style={styles.formRow}>
          <div style={styles.formColumn}>
            <div style={styles.formGroup}>
              <label htmlFor="customer_person" style={styles.label}>
                Contact Person
                {isAutoFilled('customer_person') && (
                  <span style={styles.autoFillHint}>Auto-filled</span>
                )}
              </label>
              <input
                type="text"
                id="customer_person"
                name="customer_person"
                value={formState.customer_person}
                onChange={handleChange}
                placeholder="Customer contact person"
                disabled={isSubmitting}
                style={{
                  ...styles.input,
                  ...(isAutoFilled('customer_person') ? styles.autoFillField : {}),
                  ...(isSubmitting ? styles.disabled : {}),
                }}
              />
            </div>
          </div>
         
        </div>

        <div style={styles.formRow}>
          <div style={styles.formColumn}>
            <div style={styles.formGroup}>
              <label htmlFor="customer_contact" style={styles.label}>
                Phone Number
                {isAutoFilled('customer_contact') && (
                  <span style={styles.autoFillHint}>Auto-filled</span>
                )}
              </label>
              <input
                type="tel"
                id="customer_contact"
                name="customer_contact"
                value={formState.customer_contact}
                onChange={handleChange}
                placeholder="+91 98765 43210"
                disabled={isSubmitting}
                style={{
                  ...styles.input,
                  ...(isAutoFilled('customer_contact') ? styles.autoFillField : {}),
                  ...(isSubmitting ? styles.disabled : {}),
                }}
              />
              <small style={styles.fieldHint}>Include country code</small>
            </div>
          </div>
        </div>

  
        {/* End Customer Section */}
        <h3 style={styles.sectionHeader}>End Customer Details <span style={{fontSize: '0.9rem', color: '#6c757d', fontWeight: 'normal'}}></span></h3>
        
        <div style={styles.formGroup}>
          <label htmlFor="end_customer" style={styles.label}>
            End Customer
            {formState.end_customer && formState.end_customer !== "Other" && isEndCustomerAutoFilled('end_customer_person') && (
              <span style={styles.autoFillHint}>Details auto-filled</span>
            )}
          </label>
          {loadingCustomers ? (
            <div style={styles.loadingSelect}>Loading customers...</div>
          ) : (
            <select
              id="end_customer"
              name="end_customer"
              value={formState.end_customer}
              onChange={handleChange}
              disabled={isSubmitting}
              style={{
                ...styles.select,
                ...(isSubmitting ? styles.disabled : {}),
              }}
            >
              <option value="">Select End Customer (if different)</option>
              <option value="Same as Customer">Same as Customer</option>
              {customers.map((customerName, index) => (
                <option key={`end-${index}`} value={customerName}>
                  {customerName}
                </option>
              ))}
              <option value="Other">Other (Specify Below)</option>
            </select>
          )}
        </div>

        {formState.end_customer === "Other" && (
          <div style={styles.newCustomerField}>
            <label htmlFor="newEndCustomer" style={styles.label}>
              Specify End Customer Name
            </label>
            <input
              type="text"
              id="newEndCustomer"
              name="newEndCustomer"
              value={formState.newEndCustomer}
              onChange={handleChange}
              placeholder="Enter new end customer name"
              disabled={isSubmitting}
              style={{
                ...styles.input,
                ...(isSubmitting ? styles.disabled : {}),
              }}
            />
          </div>
        )}

        {/* Show end customer contact details only if end customer is selected and not "Same as Customer" */}
        {(formState.end_customer && formState.end_customer !== "Same as Customer") && (
          <>
            <h4 style={styles.sectionSubHeader}>End Customer Contact Information</h4>
            
            <div style={styles.formRow}>
              <div style={styles.formColumn}>
                <div style={styles.formGroup}>
                  <label htmlFor="end_customer_person" style={styles.label}>
                    Contact Person
                    {isEndCustomerAutoFilled('end_customer_person') && (
                      <span style={styles.autoFillHint}>Auto-filled</span>
                    )}
                  </label>
                  <input
                    type="text"
                    id="end_customer_person"
                    name="end_customer_person"
                    value={formState.end_customer_person}
                    onChange={handleChange}
                    placeholder="End customer contact person"
                    disabled={isSubmitting}
                    style={{
                      ...styles.input,
                      ...(isEndCustomerAutoFilled('end_customer_person') ? styles.autoFillField : {}),
                      ...(isSubmitting ? styles.disabled : {}),
                    }}
                  />
                </div>
              </div>
          
            </div>

            <div style={styles.formRow}>
              <div style={styles.formColumn}>
                <div style={styles.formGroup}>
                  <label htmlFor="end_customer_contact" style={styles.label}>
                    Phone Number
                    {isEndCustomerAutoFilled('end_customer_contact') && (
                      <span style={styles.autoFillHint}>Auto-filled</span>
                    )}
                  </label>
                  <input
                    type="tel"
                    id="end_customer_contact"
                    name="end_customer_contact"
                    value={formState.end_customer_contact}
                    onChange={handleChange}
                    placeholder="+91 98765 43210"
                    disabled={isSubmitting}
                    style={{
                      ...styles.input,
                      ...(isEndCustomerAutoFilled('end_customer_contact') ? styles.autoFillField : {}),
                      ...(isSubmitting ? styles.disabled : {}),
                    }}
                  />
                  <small style={styles.fieldHint}>Include country code</small>
                </div>
              </div>
            </div>

          
          </>
        )}

        {/* Project Details */}
        <h3 style={styles.sectionHeader}>Additional Details</h3>
        
        <div style={styles.formGroup}>
          <label htmlFor="description" style={styles.label}>Description</label>
          <textarea
            id="description"
            name="description"
            value={formState.description}
            onChange={handleChange}
            placeholder="Enter project description..."
            rows="3"
            disabled={isSubmitting}
            style={{
              ...styles.textarea,
              ...(isSubmitting ? styles.disabled : {}),
            }}
          />
        </div>

        <div style={styles.formRow}>
          <div style={styles.formColumn}>
            <div style={styles.formGroup}>
              <label htmlFor="assigned_employee" style={styles.label}>
                Assign to Employee
              </label>
              <input
                type="text"
                id="assigned_employee"
                name="assigned_employee"
                value={formState.assigned_employee}
                onChange={handleChange}
                disabled={isSubmitting}
                placeholder="e.g., EMP001 or johndoe"
                style={{
                  ...styles.input,
                  ...(isSubmitting ? styles.disabled : {}),
                }}
              />
              <small style={styles.fieldHint}>
                Enter employee ID or username. Leave empty if not assigned.
              </small>
            </div>
          </div>
     
        </div>

        {/* NEW: Multiple Employee Assignments */}
        <div style={styles.formRow}>
          <div style={styles.formColumn}>
            <div style={styles.formGroup}>
              <label htmlFor="employeeSearchInput" style={styles.label}>
                Assign Multiple Employees
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  id="employeeSearchInput"
                  value={employeeSearchInput}
                  onChange={(e) => setEmployeeSearchInput(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="e.g., EMP001, EMP002, or employee names"
                  style={{
                    ...styles.input,
                    flex: 1,
                    ...(isSubmitting ? styles.disabled : {}),
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (employeeSearchInput.trim()) {
                      const empIds = employeeSearchInput.split(',').map(e => e.trim()).filter(e => e);
                      setFormState(prev => ({
                        ...prev,
                        assigned_employees: [...new Set([...prev.assigned_employees, ...empIds])]
                      }));
                      setEmployeeSearchInput("");
                    }
                  }}
                  disabled={isSubmitting || !employeeSearchInput.trim()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isSubmitting || !employeeSearchInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting || !employeeSearchInput.trim() ? 0.6 : 1,
                  }}
                >
                  Add
                </button>
              </div>
              <small style={styles.fieldHint}>
                Separate multiple employees with commas (e.g., EMP001, EMP002, johndoe)
              </small>
            </div>
          </div>
        </div>

        {/* Display assigned employees list */}
        {formState.assigned_employees && formState.assigned_employees.length > 0 && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Assigned Employees ({formState.assigned_employees.length})</label>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '8px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}>
              {formState.assigned_employees.map((empId, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '14px'
                  }}
                >
                  {empId}
                  <button
                    type="button"
                    onClick={() => {
                      setFormState(prev => ({
                        ...prev,
                        assigned_employees: prev.assigned_employees.filter((_, i) => i !== index)
                      }));
                    }}
                    disabled={isSubmitting}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      fontSize: '18px',
                      padding: '0',
                      lineHeight: '1',
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.formRow}>
          <div style={styles.formColumn}>
            <div style={styles.formGroup}>
              <label htmlFor="start_date" style={styles.label}>Start Date</label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                value={formState.start_date || ""}
                onChange={handleChange}
                disabled={isSubmitting}
                style={{
                  ...styles.input,
                  ...(isSubmitting ? styles.disabled : {}),
                }}
              />
            </div>
          </div>
          <div style={styles.formColumn}>
            <div style={styles.formGroup}>
              <label htmlFor="end_date" style={styles.label}>End Date</label>
              <input
                type="date"
                id="end_date"
                name="end_date"
                value={formState.end_date || ""}
                onChange={handleChange}
                disabled={isSubmitting}
                style={{
                  ...styles.input,
                  ...(isSubmitting ? styles.disabled : {}),
                }}
              />
            </div>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              name="requires_reporting"
              checked={formState.requires_reporting}
              onChange={(e) => setFormState(prev => ({
                ...prev,
                requires_reporting: e.target.checked
              }))}
              disabled={isSubmitting}
              style={styles.checkbox}
            />
            <span style={styles.label}>
              Require daily/hourly reporting from assigned employees
            </span>
          </label>
        </div>

        <div style={styles.formActions}>
          <button 
            type="button" 
            onClick={onClose} 
            style={{
              ...styles.btnSecondary,
              ...(isSubmitting ? styles.btnSecondaryDisabled : {}),
            }}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting} 
            style={{
              ...styles.btnPrimary,
              ...(isSubmitting ? styles.btnPrimaryDisabled : {}),
            }}
          >
            {submitButtonText}
          </button>
        </div>
      </form>
    </div>
  );
};
  
export default ProjectForm;