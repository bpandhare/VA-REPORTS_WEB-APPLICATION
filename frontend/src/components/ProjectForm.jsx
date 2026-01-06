import React, { useState, useEffect } from "react";
import { updateProject, createProject, getCustomersList } from "../services/api";

const ProjectForm = ({ projectId, initialData, onSuccess, onClose }) => {
  const [formState, setFormState] = useState({
    name: "",
    customer: "",
    end_customer: "",  // NEW FIELD
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
      // Fetch regular customers
      const response = await getCustomersList();
      if (response.data?.success) {
        setCustomers(response.data.customers || []);
      }
      
      // You might want a separate endpoint for end customers
      // For now, use the same list
      setEndCustomers(response.data.customers || []);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Load initial data when component mounts
  useEffect(() => {
    if (initialData && projectId) {
      console.log("Loading initial data for edit:", {
        id: initialData.id,
        name: initialData.name,
        customer: initialData.customer,
        end_customer: initialData.end_customer
      });
      
      // Format dates for input fields
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
        end_customer: initialData.end_customer || "",  // NEW
        newCustomer: "",
        newEndCustomer: "",
        description: initialData.description || "",
        status: initialData.status || "active",
        priority: initialData.priority || "medium",
        start_date: formatDate(initialData.start_date),
        end_date: formatDate(initialData.end_date),
      });
      
      // Check if customer exists in the list
      if (initialData.customer && !customers.includes(initialData.customer)) {
        setShowNewCustomer(true);
      }
      
      // Check if end customer exists in the list
      if (initialData.end_customer && !endCustomers.includes(initialData.end_customer)) {
        setShowNewEndCustomer(true);
      }
    } else {
      console.log("Setting up for create mode");
      // Reset form for create mode
      setFormState({
        name: "",
        customer: "",
        end_customer: "",
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
    
    // Handle customer dropdown
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
    // Handle end customer dropdown
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
    // Handle other fields
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
    console.log("Form data:", formState);

    try {
      // Clean up form data
      const cleanedData = { 
        name: formState.name.trim(),
        customer: customer,
        end_customer: endCustomer || null,  // NEW: Can be null
        description: formState.description.trim() || "",
        status: formState.status,
        priority: formState.priority
      };
      
      // Add dates if provided
      if (formState.start_date) cleanedData.start_date = formState.start_date;
      if (formState.end_date) cleanedData.end_date = formState.end_date;

      console.log("Cleaned data to send:", cleanedData);

      let response;
      
      // Handle EDIT mode
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
      // Handle CREATE mode
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

  // Determine button text and title
  const formTitle = isEditMode ? "Edit Project" : "Create New Project";
  const submitButtonText = isEditMode 
    ? (isSubmitting ? "Updating..." : "Update Project")
    : (isSubmitting ? "Creating..." : "Create Project");

  return (
    <div className="project-form">
      <h2>{formTitle}</h2>
      
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Project Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formState.name}
            onChange={handleChange}
            required
            placeholder="Enter project name"
            disabled={isSubmitting}
          />
        </div>

        {/* Customer Field */}
        <div className="form-group">
          <label htmlFor="customer">Customer *</label>
          {loadingCustomers ? (
            <div className="loading-select">Loading customers...</div>
          ) : (
            <>
              <select
                id="customer"
                name="customer"
                value={showNewCustomer ? "new" : formState.customer}
                onChange={handleChange}
                required
                disabled={isSubmitting}
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
                <div className="new-customer-field">
                  <input
                    type="text"
                    name="newCustomer"
                    value={formState.newCustomer}
                    onChange={handleChange}
                    placeholder="Enter new customer name"
                    disabled={isSubmitting}
                    required
                  />
                  <small className="field-hint">This customer will be saved for future use</small>
                </div>
              )}
            </>
          )}
        </div>

        {/* End Customer Field - NEW */}
        <div className="form-group">
          <label htmlFor="end_customer">End Customer (Optional)</label>
          {loadingCustomers ? (
            <div className="loading-select">Loading end customers...</div>
          ) : (
            <>
              <select
                id="end_customer"
                name="end_customer"
                value={showNewEndCustomer ? "new" : formState.end_customer}
                onChange={handleChange}
                disabled={isSubmitting}
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
                <div className="new-customer-field">
                  <input
                    type="text"
                    name="newEndCustomer"
                    value={formState.newEndCustomer}
                    onChange={handleChange}
                    placeholder="Enter new end customer name"
                    disabled={isSubmitting}
                  />
                  <small className="field-hint">This end customer will be saved for future use</small>
                </div>
              )}
            </>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formState.description}
            onChange={handleChange}
            placeholder="Enter project description"
            rows="3"
            disabled={isSubmitting}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select 
              id="status" 
              name="status" 
              value={formState.status} 
              onChange={handleChange}
              disabled={isSubmitting}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
              <option value="overdue">Overdue</option>
              <option value="planning">Planning</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="priority">Priority</label>
            <select 
              id="priority" 
              name="priority" 
              value={formState.priority} 
              onChange={handleChange}
              disabled={isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="start_date">Start Date</label>
            <input
              type="date"
              id="start_date"
              name="start_date"
              value={formState.start_date || ""}
              onChange={handleChange}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="end_date">End Date</label>
            <input
              type="date"
              id="end_date"
              name="end_date"
              value={formState.end_date || ""}
              onChange={handleChange}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="button" 
            onClick={onClose} 
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="btn-primary"
          >
            {submitButtonText}
          </button>
        </div>
      </form>

      <style jsx>{`
        .project-form {
          padding: 20px;
          max-width: 600px;
          margin: 0 auto;
        }

        .project-form h2 {
          margin-bottom: 15px;
          color: #333;
          font-size: 1.5rem;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #555;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-group input:disabled,
        .form-group textarea:disabled,
        .form-group select:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: #007bff;
        }

        .new-customer-field {
          margin-top: 10px;
          animation: fadeIn 0.3s ease;
        }

        .field-hint {
          display: block;
          margin-top: 4px;
          color: #6c757d;
          font-size: 12px;
        }

        .loading-select {
          padding: 10px;
          text-align: center;
          color: #6c757d;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .form-row {
          display: flex;
          gap: 15px;
        }

        .form-row .form-group {
          flex: 1;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 25px;
          padding-top: 15px;
          border-top: 1px solid #eee;
        }

        .btn-primary {
          background: #007bff;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          min-width: 140px;
        }

        .btn-primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .btn-primary:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #545b62;
        }

        .btn-secondary:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .message {
          padding: 12px 15px;
          margin-bottom: 20px;
          border-radius: 4px;
          font-weight: 500;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
};

export default ProjectForm;