-- Migration: Add trigger to automatically recalculate available_quantity when total_quantity changes

-- Function to recalculate component availability based on transactions
CREATE OR REPLACE FUNCTION recalculate_component_availability()
RETURNS TRIGGER AS $$
DECLARE
    v_issued integer;
    v_returned integer;
    v_damaged integer;
    v_net_issued integer;
BEGIN
    -- Only recalculate if total_quantity changed
    IF (OLD.total_quantity IS DISTINCT FROM NEW.total_quantity) THEN
        -- Get transaction totals
        SELECT 
            COALESCE(SUM(CASE WHEN transaction_type = 'issue' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'return' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'damaged' THEN quantity ELSE 0 END), 0)
        INTO v_issued, v_returned, v_damaged
        FROM inventory_transactions
        WHERE component_id = NEW.id;
        
        -- Calculate net issued
        v_net_issued := GREATEST(0, v_issued - v_returned);
        
        -- Update available_quantity
        NEW.available_quantity := GREATEST(0, NEW.total_quantity - v_net_issued - v_damaged);
        
        -- Auto-update status based on availability
        IF NEW.available_quantity = 0 THEN
            NEW.status := 'out_of_stock';
        ELSIF NEW.available_quantity <= GREATEST(2, CEIL(NEW.total_quantity * 0.2)) THEN
            NEW.status := 'low_stock';
        ELSE
            NEW.status := 'active';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_recalculate_availability ON components;

-- Create the trigger
CREATE TRIGGER trg_recalculate_availability
BEFORE UPDATE ON components
FOR EACH ROW EXECUTE FUNCTION recalculate_component_availability();
