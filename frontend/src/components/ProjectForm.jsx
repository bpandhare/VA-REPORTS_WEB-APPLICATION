import React, { useState, useEffect } from "react";
import { updateProject, createProject, getCustomersList } from "../services/api";

const ProjectForm = ({ projectId, initialData, onSuccess, onClose }) => {
  const [formState, setFormState] = useState({
    name: "",
    customer: "",
    end_customer: "",
    assigned_employee: "",  // NEW: Will accept ID or username
    newCustomer: "",
    newEndCustomer: "",
    description: "",
    status: "active",
    priority: "medium",
    start_date: "",
    end_date: "",
  });

  const [customers, setCustomers] = useState([]);
  const [endCustomers, setEndCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [isEditMode, setIsEditMode] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewEndCustomer, setShowNewEndCustomer] = useState(false);

  useEffect(() => {
    console.log("ProjectForm received:", { 
      projectId, 
      initialData: initialData ? { id: initialData.id, name: initialData.name } : null,
      isEditMode: !!projectId
    });
    
    setIsEditMode(!!projectId);
    fetchCustomers();
  }, [projectId, initialData]);

  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const response = await getCustomersList();
      if (response.data?.success) {
        setCustomers(response.data.customers || []);
        setEndCustomers(response.data.customers || []);
      }
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    if (initialData && projectId) {
      console.log("Loading initial data for edit:", {
        id: initialData.id,
        name: initialData.name,
        customer: initialData.customer,
        end_customer: initialData.end_customer,
        assigned_employee: initialData.assigned_employee || initialData.employee_id || ""  // NEW
      });
      
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
        assigned_employee: initialData.assigned_employee || initialData.employee_id || "",  // NEW
        newCustomer: "",
        newEndCustomer: "",
        description: initialData.description || "",
        status: initialData.status || "active",
        priority: initialData.priority || "medium",
        start_date: formatDate(initialData.start_date),
        end_date: formatDate(initialData.end_date),
      });
      
      if (initialData.customer && !customers.includes(initialData.customer)) {
        setShowNewCustomer(true);
      }
      
      if (initialData.end_customer && !endCustomers.includes(initialData.end_customer)) {
        setShowNewEndCustomer(true);
      }
    } else {
      console.log("Setting up for create mode");
      setFormState({
        name: "",
        customer: "",
        end_customer: "",
        assigned_employee: "",  // NEW
        newCustomer: "",
        newEndCustomer: "",
        description: "",
        status: "active",
        priority: "medium",
        start_date: "",
        end_date: "",
      });
      setShowNewCustomer(false);
      setShowNewEndCustomer(false);
    }
  }, [projectId, initialData, customers, endCustomers]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === "customer" && value === "new") {
      setShowNewCustomer(true);
      setFormState(prev => ({
        ...prev,
        customer: "",
        newCustomer: ""
      }));
    } else if (name === "customer" && value !== "new") {
      setShowNewCustomer(false);
      setFormState(prev => ({
        ...prev,
        [name]: value,
        newCustomer: ""
      }));
    }
    else if (name === "end_customer" && value === "new") {
      setShowNewEndCustomer(true);
      setFormState(prev => ({
        ...prev,
        end_customer: "",
        newEndCustomer: ""
      }));
    } else if (name === "end_customer" && value !== "new") {
      setShowNewEndCustomer(false);
      setFormState(prev => ({
        ...prev,
        [name]: value,
        newEndCustomer: ""
      }));
    }
    else {
      setFormState((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

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
    
    const customer = showNewCustomer ? formState.newCustomer.trim() : formState.customer;
    if (!customer) {
      showMessage("error", "Customer name is required");
      setIsSubmitting(false);
      return;
    }
    
    const endCustomer = showNewEndCustomer ? formState.newEndCustomer.trim() : formState.end_customer;

    console.log("=== FORM SUBMISSION ===");
    console.log("Mode:", isEditMode ? "EDIT" : "CREATE");
    console.log("Project ID:", projectId);
    console.log("Customer:", customer);
    console.log("End Customer:", endCustomer);
    console.log("Assigned Employee:", formState.assigned_employee);

    try {
      // Clean up form data
      const cleanedData = { 
        name: formState.name.trim(),
        customer: customer,
        end_customer: endCustomer || null,
        description: formState.description.trim() || "",
        status: formState.status,
        priority: formState.priority
      };
      
      // Add assigned employee if provided
      if (formState.assigned_employee.trim()) {
        cleanedData.assigned_employee = formState.assigned_employee.trim();
      }
      
      // Add dates if provided
      if (formState.start_date) cleanedData.start_date = formState.start_date;
      if (formState.end_date) cleanedData.end_date = formState.end_date;

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
      showMessage("error", error.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
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
      maxWidth: "600px",
      margin: "0 auto",
    },
    formTitle: {
      marginBottom: "15px",
      color: "#333",
      fontSize: "1.5rem",
    },
    formGroup: {
      marginBottom: "15px",
    },
    label: {
      display: "block",
      marginBottom: "5px",
      fontWeight: "500",
      color: "#555",
    },
    input: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "14px",
    },
    textarea: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "14px",
      fontFamily: "inherit",
    },
    select: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "14px",
    },
    disabled: {
      backgroundColor: "#f5f5f5",
      cursor: "not-allowed",
    },
    focus: {
      outline: "none",
      borderColor: "#007bff",
    },
    newCustomerField: {
      marginTop: "10px",
    },
    fieldHint: {
      display: "block",
      marginTop: "4px",
      color: "#6c757d",
      fontSize: "12px",
    },
    loadingSelect: {
      padding: "10px",
      textAlign: "center",
      color: "#6c757d",
      background: "#f8f9fa",
      borderRadius: "4px",
    },
    formRow: {
      display: "flex",
      gap: "15px",
    },
    formActions: {
      display: "flex",
      justifyContents: "flex-end",
      gap: "10px",
      marginTop: "25px",
      paddingTop: "15px",
      borderTop: "1px solid #eee",
    },
    btnPrimary: {
      background: "#007bff",
      color: "white",
      padding: "10px 20px",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "500",
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
      padding: "10px 20px",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
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
        <div style={styles.formGroup}>
          <label htmlFor="name" style={styles.label}>Project Name *</label>
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

        {/* Customer Field */}
        <div style={styles.formGroup}>
          <label htmlFor="customer" style={styles.label}>Customer *</label>
          {loadingCustomers ? (
            <div style={styles.loadingSelect}>Loading customers...</div>
          ) : (
            <>
              <select
                id="customer"
                name="customer"
                value={showNewCustomer ? "new" : formState.customer}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                style={{
                  ...styles.select,
                  ...(isSubmitting ? styles.disabled : {}),
                }}
              >
                <option value="">Select Customer</option>
                {customers.map((customer, index) => (
                  <option key={index} value={customer}>
                    {customer}
                  </option>
                ))}
                <option value="new">+ Add New Customer</option>
              </select>
              
              {showNewCustomer && (
                <div style={styles.newCustomerField}>
                  <input
                    type="text"
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
                  <small style={styles.fieldHint}>This customer will be saved for future use</small>
                </div>
              )}
            </>
          )}
        </div>

        {/* End Customer Field */}
        <div style={styles.formGroup}>
          <label htmlFor="end_customer" style={styles.label}>End Customer</label>
          {loadingCustomers ? (
            <div style={styles.loadingSelect}>Loading end customers...</div>
          ) : (
            <>
              <select
                id="end_customer"
                name="end_customer"
                value={showNewEndCustomer ? "new" : formState.end_customer}
                onChange={handleChange}
                disabled={isSubmitting}
                style={{
                  ...styles.select,
                  ...(isSubmitting ? styles.disabled : {}),
                }}
              >
                <option value="">Select End Customer</option>
                <option value="">None</option>
                {endCustomers.map((customer, index) => (
                  <option key={`end-${index}`} value={customer}>
                    {customer}
                  </option>
                ))}
                <option value="new">+ Add New End Customer</option>
              </select>
              
              {showNewEndCustomer && (
                <div style={styles.newCustomerField}>
                  <input
                    type="text"
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
                  <small style={styles.fieldHint}>This end customer will be saved for future use</small>
                </div>
              )}
            </>
          )}
        </div>

        {/* Employee Assignment Field - SIMPLIFIED VERSION */}
        <div style={styles.formGroup}>
          <label htmlFor="assigned_employee" style={styles.label}>
            Assign to Employee
            <span style={{ marginLeft: "5px", fontSize: "12px", color: "#666" }}>
              (Enter Employee ID or Username)
            </span>
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
            Enter the employee's ID (EMP001) or username. Leave empty if no specific assignment.
          </small>
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="description" style={styles.label}>Description</label>
          <textarea
            id="description"
            name="description"
            value={formState.description}
            onChange={handleChange}
            placeholder="Enter project description"
            rows="3"
            disabled={isSubmitting}
            style={{
              ...styles.textarea,
              ...(isSubmitting ? styles.disabled : {}),
            }}
          />
        </div>

        <div style={styles.formRow}>
          <div style={styles.formGroup}>
            <label htmlFor="status" style={styles.label}>Status</label>
            <select 
              id="status" 
              name="status" 
              value={formState.status} 
              onChange={handleChange}
              disabled={isSubmitting}
              style={{
                ...styles.select,
                ...(isSubmitting ? styles.disabled : {}),
              }}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
              <option value="overdue">Overdue</option>
              <option value="planning">Planning</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="priority" style={styles.label}>Priority</label>
            <select 
              id="priority" 
              name="priority" 
              value={formState.priority} 
              onChange={handleChange}
              disabled={isSubmitting}
              style={{
                ...styles.select,
                ...(isSubmitting ? styles.disabled : {}),
              }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div style={styles.formRow}>
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